import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { MailService } from '../auth/mail.service.js';
import { Notification, NotificationType } from '../database/schemas/notification.schema.js';
import { User } from '../database/schemas/user.schema.js';
import {
  ListNotificationsQueryDto,
  MarkAllNotificationsReadDto,
  NotificationItemDto,
  NotificationsPageDto,
  UnreadNotificationCountDto,
} from './dto/notifications.dto.js';

export const NOTIFICATIONS_PAGE_SIZE = 10;

type NotificationRecord = Notification & { _id: Types.ObjectId; createdAt?: Date };

export interface CreateNotificationInput {
  userId: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  message: string;
  metadata?: Record<string, unknown>;
  email?: string;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    @Optional() @InjectModel(User.name) private readonly userModel?: Model<User>,
    @Optional() private readonly mailService?: MailService,
  ) {}

  /**
   * GEN-01, GEN-01-B: creates an in-app notification for the user and dispatches an email over SMTP
   * (using the configured SMTP server or development Ethereal test inbox). Email failures are logged
   * and never fail the primary business operation.
   */
  async create(input: CreateNotificationInput): Promise<NotificationItemDto> {
    const userObjectId = typeof input.userId === 'string' ? new Types.ObjectId(input.userId) : input.userId;
    const created = await this.notificationModel.create({
      userId: userObjectId,
      type: input.type,
      title: input.title,
      message: input.message,
      isRead: false,
      readAt: null,
      metadata: input.metadata ?? {},
    });
    const record = (typeof created.toObject === 'function' ? created.toObject() : created) as NotificationRecord;

    await this.deliverEmail(userObjectId, input.email, input.title, input.message);
    return toNotificationDto(record);
  }

  /** GEN-01, GEN-05: paginated list of the logged-in user's notifications (10 per page, newest first). */
  async listForUser(userId: string, query: ListNotificationsQueryDto): Promise<NotificationsPageDto> {
    const userObjectId = new Types.ObjectId(userId);
    const page = query.page ?? 1;
    const filter: Record<string, unknown> = { userId: userObjectId };
    if (query.unreadOnly) filter.isRead = false;
    if (query.type) filter.type = query.type;

    const [items, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * NOTIFICATIONS_PAGE_SIZE)
        .limit(NOTIFICATIONS_PAGE_SIZE)
        .lean<NotificationRecord[]>()
        .exec(),
      this.notificationModel.countDocuments(filter).exec(),
      this.notificationModel.countDocuments({ userId: userObjectId, isRead: false }).exec(),
    ]);

    return {
      items: items.map(toNotificationDto),
      page,
      pageSize: NOTIFICATIONS_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / NOTIFICATIONS_PAGE_SIZE),
      unreadCount,
    };
  }

  /** GEN-01: unread notification count for the logged-in user. */
  async getUnreadCount(userId: string): Promise<UnreadNotificationCountDto> {
    const unreadCount = await this.notificationModel
      .countDocuments({ userId: new Types.ObjectId(userId), isRead: false })
      .exec();
    return { unreadCount };
  }

  /** GEN-01: marks one of the logged-in user's notifications as read. 404 if not found or owned by another user. */
  async markAsRead(userId: string, notificationId: string): Promise<NotificationItemDto> {
    if (!isValidObjectId(notificationId)) throw new NotFoundException('Notification not found.');
    const userObjectId = new Types.ObjectId(userId);
    const existing = await this.notificationModel
      .findOne({ _id: new Types.ObjectId(notificationId), userId: userObjectId })
      .lean<NotificationRecord>()
      .exec();
    if (!existing) throw new NotFoundException('Notification not found.');
    if (existing.isRead) return toNotificationDto(existing);

    const updated = await this.notificationModel
      .findOneAndUpdate(
        { _id: existing._id, userId: userObjectId },
        { $set: { isRead: true, readAt: new Date() } },
        { returnDocument: 'after' },
      )
      .lean<NotificationRecord>()
      .exec();
    if (!updated) throw new NotFoundException('Notification not found.');
    return toNotificationDto(updated);
  }

  /** GEN-01: marks all unread notifications of the logged-in user as read. */
  async markAllAsRead(userId: string): Promise<MarkAllNotificationsReadDto> {
    const result = await this.notificationModel
      .updateMany(
        { userId: new Types.ObjectId(userId), isRead: false },
        { $set: { isRead: true, readAt: new Date() } },
      )
      .exec();
    return { markedReadCount: result.modifiedCount ?? 0 };
  }

  private async deliverEmail(
    userId: Types.ObjectId,
    explicitEmail: string | undefined,
    title: string,
    message: string,
  ): Promise<void> {
    if (!this.mailService) return;
    try {
      let to = explicitEmail;
      if (!to && this.userModel) {
        const user = await this.userModel.findById(userId).select('email').lean<{ email?: string }>().exec();
        to = user?.email;
      }
      if (!to) return;
      await this.mailService.send({
        to,
        subject: title,
        text: message,
        html: `<p>${escapeHtml(message)}</p>`,
      });
    } catch (error) {
      this.logger.warn(`Failed to send notification email "${title}": ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function toNotificationDto(record: NotificationRecord): NotificationItemDto {
  return {
    id: record._id.toString(),
    userId: record.userId.toString(),
    type: record.type,
    title: record.title,
    message: record.message,
    isRead: Boolean(record.isRead),
    readAt: record.readAt ? record.readAt.toISOString() : null,
    metadata: record.metadata ?? {},
    createdAt: (record.createdAt ?? new Date()).toISOString(),
  };
}
