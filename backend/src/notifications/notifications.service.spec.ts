import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { NotificationType } from '../database/schemas/notification.schema.js';
import { NotificationsService } from './notifications.service.js';

const chainQuery = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = {
    exec: vi.fn().mockResolvedValue(result),
  };
  for (const method of ['select', 'lean', 'sort', 'skip', 'limit']) {
    q[method] = vi.fn().mockReturnValue(q);
  }
  return q;
};

describe('NotificationsService (GEN-01, GEN-01-B)', () => {
  const userId = new Types.ObjectId();
  const notifId = new Types.ObjectId();
  const now = new Date('2026-11-20T12:00:00.000Z');

  let notificationModel: Record<string, ReturnType<typeof vi.fn>>;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let mailService: { send: ReturnType<typeof vi.fn> };
  let service: NotificationsService;

  const sampleRecord = {
    _id: notifId,
    userId,
    type: NotificationType.BOOKING_CONFIRMED,
    title: 'Booking confirmed',
    message: 'Your flight booking K7M2QX is confirmed.',
    isRead: false,
    readAt: null,
    metadata: { reference: 'K7M2QX' },
    createdAt: now,
  };

  beforeEach(() => {
    notificationModel = {
      create: vi.fn(async (data: Record<string, unknown>) => ({
        toObject: () => ({ _id: notifId, createdAt: now, ...data }),
      })),
      find: vi.fn(() => chainQuery([sampleRecord])),
      countDocuments: vi.fn(() => chainQuery(1)),
      findOne: vi.fn(() => chainQuery(sampleRecord)),
      findOneAndUpdate: vi.fn(() => chainQuery({ ...sampleRecord, isRead: true, readAt: now })),
      updateMany: vi.fn(() => chainQuery({ modifiedCount: 2 })),
    };
    userModel = {
      findById: vi.fn(() => chainQuery({ _id: userId, email: 'user@example.com' })),
    };
    mailService = {
      send: vi.fn().mockResolvedValue(true),
    };
    service = new NotificationsService(notificationModel as never, userModel as never, mailService as never);
  });

  it('creates an in-app notification and sends an SMTP email (GEN-01, GEN-01-B)', async () => {
    const result = await service.create({
      userId,
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Booking confirmed',
      message: 'Your flight booking K7M2QX is confirmed.',
      metadata: { reference: 'K7M2QX' },
    });

    expect(result).toMatchObject({
      id: notifId.toString(),
      userId: userId.toString(),
      type: NotificationType.BOOKING_CONFIRMED,
      title: 'Booking confirmed',
      isRead: false,
    });
    expect(mailService.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        subject: 'Booking confirmed',
      }),
    );
  });

  it('lists notifications paginated 10 per page with unreadCount (GEN-01, GEN-05)', async () => {
    const page = await service.listForUser(userId.toString(), { page: 1, unreadOnly: true });

    expect(notificationModel.find).toHaveBeenCalledWith({ userId, isRead: false });
    expect(page).toMatchObject({
      page: 1,
      pageSize: 10,
      total: 1,
      totalPages: 1,
      unreadCount: 1,
    });
    expect(page.items).toHaveLength(1);
  });

  it('returns unread notification count (GEN-01)', async () => {
    const res = await service.getUnreadCount(userId.toString());
    expect(res).toEqual({ unreadCount: 1 });
  });

  it('marks a notification as read and 404s on unknown or unowned ids (GEN-01)', async () => {
    const read = await service.markAsRead(userId.toString(), notifId.toString());
    expect(read.isRead).toBe(true);
    expect(read.readAt).toBe(now.toISOString());

    await expect(service.markAsRead(userId.toString(), 'invalid-id')).rejects.toThrow(NotFoundException);
    notificationModel.findOne.mockReturnValueOnce(chainQuery(null));
    await expect(service.markAsRead(userId.toString(), new Types.ObjectId().toString())).rejects.toThrow(
      NotFoundException,
    );
  });

  it('marks all unread notifications as read (GEN-01)', async () => {
    const res = await service.markAllAsRead(userId.toString());
    expect(res).toEqual({ markedReadCount: 2 });
  });
});
