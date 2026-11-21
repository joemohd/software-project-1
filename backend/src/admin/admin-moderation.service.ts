import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { type ClientSession, type Connection, isValidObjectId, type Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { AdminAction, AuditLog, AuditTargetType } from '../database/schemas/audit-log.schema.js';
import { BlogPost, PostLike, PostStatus } from '../database/schemas/blog-post.schema.js';
import { Comment } from '../database/schemas/comment.schema.js';
import { HotelBooking } from '../database/schemas/expense.schema.js';
import { ClonebaseItinerary, Itinerary } from '../database/schemas/itinerary.schema.js';
import { Hotel, Room } from '../database/schemas/provider.schema.js';
import {
  ModeratedContentType,
  Report,
  ReportResolution,
  ReportStatus,
} from '../database/schemas/report.schema.js';
import { User, UserRole } from '../database/schemas/user.schema.js';
import {
  AuditActorDto,
  AuditLogEntryDto,
  AuditLogsPageDto,
  ListAuditLogsQueryDto,
} from './dto/list-audit-logs.dto.js';
import {
  CreateReportDto,
  DeleteContentResponseDto,
  ListReportsQueryDto,
  ReportedContentPreviewDto,
  ReportEntryDto,
  ReportsPageDto,
  ResolveReportDto,
} from './dto/reports.dto.js';

// GEN-05: lists are paginated with page size 10
export const ADMIN_PAGE_SIZE = 10;

type AuditLogRecord = AuditLog & { _id: Types.ObjectId; createdAt: Date };
type ReportRecord = Report & { _id: Types.ObjectId; createdAt: Date };
type UserSummaryRecord = { _id: Types.ObjectId; fullName: string; email: string };
type PostPreviewRecord = { _id: Types.ObjectId; userId: Types.ObjectId; title: string; status: PostStatus };
type CommentPreviewRecord = { _id: Types.ObjectId; userId: Types.ObjectId; text: string; isHidden?: boolean };
type ItineraryPreviewRecord = { _id: Types.ObjectId; userId: Types.ObjectId; title: string; isHidden?: boolean };
type BookingReviewRecord = {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  rooms?: { roomId: Types.ObjectId }[];
  review: { _id?: Types.ObjectId; rating: number; comment?: string; isHidden?: boolean } | null;
};

const CONTENT_LABELS: Record<ModeratedContentType, string> = {
  [ModeratedContentType.POST]: 'Post',
  [ModeratedContentType.COMMENT]: 'Comment',
  [ModeratedContentType.REVIEW]: 'Review',
  [ModeratedContentType.ITINERARY]: 'Itinerary',
};

const CONTENT_TO_AUDIT_TARGET: Record<ModeratedContentType, AuditTargetType> = {
  [ModeratedContentType.POST]: AuditTargetType.POST,
  [ModeratedContentType.COMMENT]: AuditTargetType.COMMENT,
  [ModeratedContentType.REVIEW]: AuditTargetType.REVIEW,
  [ModeratedContentType.ITINERARY]: AuditTargetType.ITINERARY,
};

@Injectable()
export class AdminModerationService {
  constructor(
    @InjectModel(AuditLog.name) private readonly auditLogModel: Model<AuditLog>,
    @InjectModel(Report.name) private readonly reportModel: Model<Report>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(BlogPost.name) private readonly postModel: Model<BlogPost>,
    @InjectModel(PostLike.name) private readonly postLikeModel: Model<PostLike>,
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<Itinerary>,
    @InjectModel(ClonebaseItinerary.name) private readonly clonebaseItineraryModel: Model<ClonebaseItinerary>,
    @InjectModel(HotelBooking.name) private readonly hotelBookingModel: Model<HotelBooking>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  // GEN-07: paginated list of admin actions (suspensions, deletions, report resolutions, password resets)
  async listAuditLogs(admin: AuthenticatedUser, query: ListAuditLogsQueryDto): Promise<AuditLogsPageDto> {
    this.assertAdmin(admin);
    const page = query.page ?? 1;
    const filter: Record<string, unknown> = {};

    if (query.action) filter.action = query.action;
    if (query.targetType) filter.targetType = query.targetType;
    if (query.adminId) filter.adminId = new Types.ObjectId(query.adminId);
    if (query.targetId) filter.targetId = new Types.ObjectId(query.targetId);

    if (query.from || query.to) {
      const fromDate = query.from ? this.parseDateBound(query.from, 'from', false) : undefined;
      const toDate = query.to ? this.parseDateBound(query.to, 'to', true) : undefined;
      if (fromDate && toDate && fromDate > toDate) {
        throw new BadRequestException('from cannot be after to.');
      }
      filter.createdAt = {
        ...(fromDate ? { $gte: fromDate } : {}),
        ...(toDate ? { $lte: toDate } : {}),
      };
    }

    const [logs, total] = await Promise.all([
      this.auditLogModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * ADMIN_PAGE_SIZE)
        .limit(ADMIN_PAGE_SIZE)
        .lean<AuditLogRecord[]>()
        .exec(),
      this.auditLogModel.countDocuments(filter).exec(),
    ]);

    const actors = await this.loadActors(logs.map((log) => log.adminId));
    const items: AuditLogEntryDto[] = logs.map((log) => ({
      id: log._id.toString(),
      adminId: log.adminId.toString(),
      admin: actors.get(log.adminId.toString()) ?? null,
      action: log.action,
      targetType: log.targetType,
      targetId: log.targetId.toString(),
      reason: log.reason ?? null,
      metadata: log.metadata ?? {},
      createdAt: log.createdAt,
    }));

    return {
      items,
      page,
      pageSize: ADMIN_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / ADMIN_PAGE_SIZE),
    };
  }

  // GEN-09: a registered user reports a post, comment, review or itinerary with a reason, at most once per item
  async createReport(user: AuthenticatedUser, dto: CreateReportDto): Promise<ReportEntryDto> {
    if (user.role !== UserRole.USER) {
      throw new ForbiddenException('Only registered users can submit content reports.');
    }
    if (!isValidObjectId(dto.targetId)) {
      throw new NotFoundException(`${CONTENT_LABELS[dto.targetType]} not found.`);
    }

    const targetObjectId = new Types.ObjectId(dto.targetId);
    const reporterObjectId = new Types.ObjectId(user.id);
    const dummyReport: ReportRecord = {
      _id: new Types.ObjectId(),
      reporterId: reporterObjectId,
      targetType: dto.targetType,
      targetId: targetObjectId,
      reason: dto.reason,
      status: ReportStatus.OPEN,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
      createdAt: new Date(),
    };
    const previews = await this.loadTargetPreviews([dummyReport]);
    const preview = previews.get(`${dto.targetType}:${dto.targetId}`);
    if (!preview || !preview.exists) {
      throw new NotFoundException(`${CONTENT_LABELS[dto.targetType]} not found.`);
    }

    const existing = await this.reportModel
      .findOne({ reporterId: reporterObjectId, targetType: dto.targetType, targetId: targetObjectId })
      .lean<ReportRecord>()
      .exec();
    if (existing) {
      throw new ConflictException('You have already reported this item.');
    }

    let createdRecord: ReportRecord;
    try {
      const created = await this.reportModel.create({
        reporterId: reporterObjectId,
        targetType: dto.targetType,
        targetId: targetObjectId,
        reason: dto.reason.trim(),
        status: ReportStatus.OPEN,
        resolvedBy: null,
        resolvedAt: null,
        resolutionNote: null,
      });
      createdRecord = (typeof created.toObject === 'function' ? created.toObject() : created) as unknown as ReportRecord;
    } catch (error) {
      if ((error as { code?: number } | null)?.code === 11000) {
        throw new ConflictException('You have already reported this item.');
      }
      throw error;
    }

    const actors = await this.loadActors([reporterObjectId]);
    return {
      id: createdRecord._id.toString(),
      reporterId: reporterObjectId.toString(),
      reporter: actors.get(reporterObjectId.toString()) ?? null,
      targetType: createdRecord.targetType,
      targetId: createdRecord.targetId.toString(),
      target: preview,
      reason: createdRecord.reason,
      status: createdRecord.status,
      resolvedBy: null,
      resolvedAt: null,
      resolutionNote: null,
      createdAt: createdRecord.createdAt ?? new Date(),
    };
  }

  // GEN-09, GEN-10: paginated list of reports (defaults to open reports)
  async listReports(admin: AuthenticatedUser, query: ListReportsQueryDto): Promise<ReportsPageDto> {
    this.assertAdmin(admin);
    const page = query.page ?? 1;
    const status = query.status ?? ReportStatus.OPEN;
    const filter: Record<string, unknown> = { status };
    if (query.targetType) filter.targetType = query.targetType;

    const [reports, total] = await Promise.all([
      this.reportModel
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * ADMIN_PAGE_SIZE)
        .limit(ADMIN_PAGE_SIZE)
        .lean<ReportRecord[]>()
        .exec(),
      this.reportModel.countDocuments(filter).exec(),
    ]);

    const [actors, previews] = await Promise.all([
      this.loadActors(reports.map((report) => report.reporterId)),
      this.loadTargetPreviews(reports),
    ]);

    const items: ReportEntryDto[] = reports.map((report) => ({
      id: report._id.toString(),
      reporterId: report.reporterId.toString(),
      reporter: actors.get(report.reporterId.toString()) ?? null,
      targetType: report.targetType,
      targetId: report.targetId.toString(),
      target: previews.get(`${report.targetType}:${report.targetId.toString()}`) ?? {
        exists: false,
        authorId: null,
        summary: null,
        isHidden: false,
      },
      reason: report.reason,
      status: report.status,
      resolvedBy: report.resolvedBy ? report.resolvedBy.toString() : null,
      resolvedAt: report.resolvedAt ?? null,
      resolutionNote: report.resolutionNote ?? null,
      createdAt: report.createdAt,
    }));

    return {
      items,
      page,
      pageSize: ADMIN_PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / ADMIN_PAGE_SIZE),
    };
  }

  // GEN-10, GEN-07: resolve an open report by dismissing it, hiding the content, or deleting the content
  async resolveReport(admin: AuthenticatedUser, reportId: string, dto: ResolveReportDto): Promise<ReportEntryDto> {
    this.assertAdmin(admin);
    if (!isValidObjectId(reportId)) throw new NotFoundException('Report not found.');
    const adminObjectId = new Types.ObjectId(admin.id);
    const now = new Date();
    const note = dto.note?.trim() || null;

    const updatedReport = await this.connection.transaction(async (session) => {
      const report = await this.reportModel
        .findById(reportId)
        .session(session)
        .lean<ReportRecord>()
        .exec();
      if (!report) throw new NotFoundException('Report not found.');
      if (report.status !== ReportStatus.OPEN) {
        throw new ConflictException('This report has already been resolved.');
      }

      let nextStatus: ReportStatus;
      let auditAction: AdminAction;
      let auditTargetType: AuditTargetType;
      let auditTargetId: Types.ObjectId;

      if (dto.action === ReportResolution.DISMISS) {
        nextStatus = ReportStatus.DISMISSED;
        auditAction = AdminAction.DISMISS_REPORT;
        auditTargetType = AuditTargetType.REPORT;
        auditTargetId = report._id;

        await this.reportModel
          .updateOne(
            { _id: report._id, status: ReportStatus.OPEN },
            {
              $set: {
                status: nextStatus,
                resolvedBy: adminObjectId,
                resolvedAt: now,
                resolutionNote: note,
              },
            },
            { session },
          )
          .exec();
      } else if (dto.action === ReportResolution.HIDE) {
        nextStatus = ReportStatus.HIDDEN;
        auditAction = AdminAction.HIDE_CONTENT;
        auditTargetType = CONTENT_TO_AUDIT_TARGET[report.targetType];
        auditTargetId = report.targetId;

        await this.hideTargetContent(report.targetType, report.targetId, session);
        await this.reportModel
          .updateMany(
            { targetType: report.targetType, targetId: report.targetId, status: ReportStatus.OPEN },
            {
              $set: {
                status: nextStatus,
                resolvedBy: adminObjectId,
                resolvedAt: now,
                resolutionNote: note,
              },
            },
            { session },
          )
          .exec();
      } else {
        nextStatus = ReportStatus.DELETED;
        auditAction = AdminAction.DELETE_CONTENT;
        auditTargetType = CONTENT_TO_AUDIT_TARGET[report.targetType];
        auditTargetId = report.targetId;

        await this.deleteTargetContent(report.targetType, report.targetId, session);
        await this.reportModel
          .updateMany(
            { targetType: report.targetType, targetId: report.targetId, status: ReportStatus.OPEN },
            {
              $set: {
                status: nextStatus,
                resolvedBy: adminObjectId,
                resolvedAt: now,
                resolutionNote: note,
              },
            },
            { session },
          )
          .exec();
      }

      await this.auditLogModel.create(
        [
          {
            adminId: adminObjectId,
            action: auditAction,
            targetType: auditTargetType,
            targetId: auditTargetId,
            reason: note ?? report.reason,
            metadata: {
              reportId: report._id.toString(),
              resolution: dto.action,
              contentType: report.targetType,
              contentId: report.targetId.toString(),
            },
          },
        ],
        { session },
      );

      return {
        _id: report._id,
        reporterId: report.reporterId,
        targetType: report.targetType,
        targetId: report.targetId,
        reason: report.reason,
        createdAt: report.createdAt,
        status: nextStatus,
        resolvedBy: adminObjectId,
        resolvedAt: now,
        resolutionNote: note,
      };
    });

    const [actors, previews] = await Promise.all([
      this.loadActors([updatedReport.reporterId]),
      this.loadTargetPreviews([updatedReport]),
    ]);

    return {
      id: updatedReport._id.toString(),
      reporterId: updatedReport.reporterId.toString(),
      reporter: actors.get(updatedReport.reporterId.toString()) ?? null,
      targetType: updatedReport.targetType,
      targetId: updatedReport.targetId.toString(),
      target: previews.get(`${updatedReport.targetType}:${updatedReport.targetId.toString()}`) ?? {
        exists: false,
        authorId: null,
        summary: null,
        isHidden: false,
      },
      reason: updatedReport.reason,
      status: updatedReport.status,
      resolvedBy: updatedReport.resolvedBy ? updatedReport.resolvedBy.toString() : null,
      resolvedAt: updatedReport.resolvedAt ?? null,
      resolutionNote: updatedReport.resolutionNote ?? null,
      createdAt: updatedReport.createdAt,
    };
  }

  // GEN-10, GEN-07: delete any post, comment, review or itinerary directly and record an audit log
  async deleteContent(
    admin: AuthenticatedUser,
    type: ModeratedContentType,
    id: string,
    reason?: string,
  ): Promise<DeleteContentResponseDto> {
    this.assertAdmin(admin);
    if (!isValidObjectId(id)) throw new NotFoundException(`${CONTENT_LABELS[type]} not found.`);
    const targetId = new Types.ObjectId(id);
    const adminObjectId = new Types.ObjectId(admin.id);
    const now = new Date();
    const trimmedReason = reason?.trim() || null;

    await this.connection.transaction(async (session) => {
      await this.deleteTargetContent(type, targetId, session);

      // Resolve any open reports on the deleted item so they don't remain dangling in the open queue
      await this.reportModel
        .updateMany(
          { targetType: type, targetId, status: ReportStatus.OPEN },
          {
            $set: {
              status: ReportStatus.DELETED,
              resolvedBy: adminObjectId,
              resolvedAt: now,
              resolutionNote: trimmedReason ?? 'Target content deleted directly by administrator.',
            },
          },
          { session },
        )
        .exec();

      await this.auditLogModel.create(
        [
          {
            adminId: adminObjectId,
            action: AdminAction.DELETE_CONTENT,
            targetType: CONTENT_TO_AUDIT_TARGET[type],
            targetId,
            reason: trimmedReason,
            metadata: { contentType: type },
          },
        ],
        { session },
      );
    });

    return {
      deleted: true,
      type,
      id,
      message: `${CONTENT_LABELS[type]} deleted and action recorded in the audit log.`,
    };
  }

  /**
   * GEN-10: hides a post (by setting status to ARCHIVED, matching BlogModule), comment, review or itinerary.
   * Hidden content stays visible only to its author and admins.
   */
  private async hideTargetContent(
    type: ModeratedContentType,
    targetId: Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    if (type === ModeratedContentType.POST) {
      const post = await this.postModel
        .findOneAndUpdate({ _id: targetId }, { $set: { status: PostStatus.ARCHIVED } }, { session, returnDocument: 'after' })
        .lean()
        .exec();
      if (!post) throw new NotFoundException('Post not found.');
      return;
    }

    if (type === ModeratedContentType.COMMENT) {
      const comment = await this.commentModel
        .findOneAndUpdate({ _id: targetId }, { $set: { isHidden: true } }, { session, returnDocument: 'after' })
        .lean()
        .exec();
      if (!comment) throw new NotFoundException('Comment not found.');
      return;
    }

    if (type === ModeratedContentType.ITINERARY) {
      const itinerary = await this.itineraryModel
        .findOneAndUpdate({ _id: targetId }, { $set: { isHidden: true } }, { session, returnDocument: 'after' })
        .lean()
        .exec();
      if (!itinerary) throw new NotFoundException('Itinerary not found.');
      return;
    }

    if (type === ModeratedContentType.REVIEW) {
      const booking = await this.hotelBookingModel
        .findOneAndUpdate(
          { 'review._id': targetId },
          { $set: { 'review.isHidden': true } },
          { session, returnDocument: 'after' },
        )
        .lean<BookingReviewRecord>()
        .exec();
      if (!booking) throw new NotFoundException('Review not found.');
      await this.recalculateHotelAverageForBooking(booking, session);
      return;
    }
  }

  /**
   * GEN-10: permanently deletes a post, comment, review or itinerary and cleans up dependent records.
   */
  private async deleteTargetContent(
    type: ModeratedContentType,
    targetId: Types.ObjectId,
    session: ClientSession,
  ): Promise<void> {
    if (type === ModeratedContentType.POST) {
      const deleted = await this.postModel.findOneAndDelete({ _id: targetId }, { session }).lean().exec();
      if (!deleted) throw new NotFoundException('Post not found.');
      await this.commentModel.deleteMany({ postId: targetId }, { session }).exec();
      await this.postLikeModel.deleteMany({ postId: targetId }, { session }).exec();
      return;
    }

    if (type === ModeratedContentType.COMMENT) {
      const deleted = await this.commentModel.findOneAndDelete({ _id: targetId }, { session }).lean().exec();
      if (!deleted) throw new NotFoundException('Comment not found.');
      await this.commentModel.deleteMany({ parentCommentId: targetId }, { session }).exec();
      return;
    }

    if (type === ModeratedContentType.ITINERARY) {
      const deleted = await this.itineraryModel.findOneAndDelete({ _id: targetId }, { session }).lean().exec();
      if (!deleted) throw new NotFoundException('Itinerary not found.');
      // ITN-01: clones previously made by other users remain unaffected; remove only the clone lineage link
      await this.clonebaseItineraryModel
        .deleteMany({ $or: [{ baseItineraryId: targetId }, { derivedItineraryId: targetId }] }, { session })
        .exec();
      await this.postModel
        .updateMany({ itineraryId: targetId }, { $set: { itineraryId: null } }, { session })
        .exec();
      return;
    }

    if (type === ModeratedContentType.REVIEW) {
      const booking = await this.hotelBookingModel
        .findOneAndUpdate(
          { 'review._id': targetId },
          { $set: { review: null }, $unset: { rating: 1 } },
          { session, returnDocument: 'before' },
        )
        .lean<BookingReviewRecord>()
        .exec();
      if (!booking) throw new NotFoundException('Review not found.');
      await this.recalculateHotelAverageForBooking(booking, session);
      return;
    }
  }

  /** HTL-23, GEN-10: updates the hotel's averageRating from its remaining visible reviews. */
  private async recalculateHotelAverageForBooking(
    booking: BookingReviewRecord,
    session: ClientSession,
  ): Promise<void> {
    const firstRoomId = booking.rooms?.[0]?.roomId;
    if (!firstRoomId) return;

    const room = await this.roomModel
      .findById(firstRoomId)
      .select('hotelId')
      .session(session)
      .lean<{ hotelId: Types.ObjectId }>()
      .exec();
    if (!room) return;

    const hotelRoomIds = await this.roomModel
      .find({ hotelId: room.hotelId })
      .session(session)
      .distinct('_id')
      .exec();

    const reviewedBookings = await this.hotelBookingModel
      .find({
        'rooms.roomId': { $in: hotelRoomIds },
        review: { $ne: null },
        'review.isHidden': { $ne: true },
      })
      .select('review')
      .session(session)
      .lean<{ review: { rating: number } | null }[]>()
      .exec();

    const ratings = reviewedBookings
      .map((item) => item.review?.rating)
      .filter((rating): rating is number => typeof rating === 'number');

    const averageRating = ratings.length
      ? Math.round((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length) * 100) / 100
      : 0;

    await this.hotelModel
      .updateOne({ _id: room.hotelId }, { $set: { averageRating } }, { session })
      .exec();
  }

  private async loadActors(ids: Types.ObjectId[]): Promise<Map<string, AuditActorDto>> {
    const uniqueIds = [...new Set(ids.map((id) => id.toString()))].map((id) => new Types.ObjectId(id));
    if (!uniqueIds.length) return new Map();

    const users = await this.userModel
      .find({ _id: { $in: uniqueIds } })
      .select('fullName email')
      .lean<UserSummaryRecord[]>()
      .exec();

    return new Map(
      users.map((user) => [
        user._id.toString(),
        { id: user._id.toString(), fullName: user.fullName, email: user.email },
      ]),
    );
  }

  private async loadTargetPreviews(reports: ReportRecord[]): Promise<Map<string, ReportedContentPreviewDto>> {
    const byType: Record<ModeratedContentType, Types.ObjectId[]> = {
      [ModeratedContentType.POST]: [],
      [ModeratedContentType.COMMENT]: [],
      [ModeratedContentType.REVIEW]: [],
      [ModeratedContentType.ITINERARY]: [],
    };
    for (const report of reports) {
      byType[report.targetType].push(report.targetId);
    }

    const [posts, comments, reviews, itineraries] = await Promise.all([
      byType.post.length
        ? this.postModel
            .find({ _id: { $in: byType.post } })
            .select('userId title status')
            .lean<PostPreviewRecord[]>()
            .exec()
        : Promise.resolve([]),
      byType.comment.length
        ? this.commentModel
            .find({ _id: { $in: byType.comment } })
            .select('userId text isHidden')
            .lean<CommentPreviewRecord[]>()
            .exec()
        : Promise.resolve([]),
      byType.review.length
        ? this.hotelBookingModel
            .find({ 'review._id': { $in: byType.review } })
            .select('userId review')
            .lean<BookingReviewRecord[]>()
            .exec()
        : Promise.resolve([]),
      byType.itinerary.length
        ? this.itineraryModel
            .find({ _id: { $in: byType.itinerary } })
            .select('userId title isHidden')
            .lean<ItineraryPreviewRecord[]>()
            .exec()
        : Promise.resolve([]),
    ]);

    const previews = new Map<string, ReportedContentPreviewDto>();

    for (const post of posts) {
      previews.set(`${ModeratedContentType.POST}:${post._id.toString()}`, {
        exists: true,
        authorId: post.userId.toString(),
        summary: post.title,
        isHidden: post.status === PostStatus.ARCHIVED,
      });
    }
    for (const comment of comments) {
      previews.set(`${ModeratedContentType.COMMENT}:${comment._id.toString()}`, {
        exists: true,
        authorId: comment.userId.toString(),
        summary: comment.text.slice(0, 120),
        isHidden: Boolean(comment.isHidden),
      });
    }
    for (const booking of reviews) {
      if (booking.review?._id) {
        previews.set(`${ModeratedContentType.REVIEW}:${booking.review._id.toString()}`, {
          exists: true,
          authorId: booking.userId.toString(),
          summary: booking.review.comment
            ? `${booking.review.rating}/5: ${booking.review.comment.slice(0, 100)}`
            : `${booking.review.rating}/5`,
          isHidden: Boolean(booking.review.isHidden),
        });
      }
    }
    for (const itinerary of itineraries) {
      previews.set(`${ModeratedContentType.ITINERARY}:${itinerary._id.toString()}`, {
        exists: true,
        authorId: itinerary.userId.toString(),
        summary: itinerary.title,
        isHidden: Boolean(itinerary.isHidden),
      });
    }

    return previews;
  }

  private parseDateBound(raw: string, field: string, endOfDayIfDateOnly: boolean): Date {
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
    const iso = isDateOnly ? `${raw}T${endOfDayIfDateOnly ? '23:59:59.999' : '00:00:00.000'}Z` : raw;
    const date = new Date(iso);
    if (Number.isNaN(date.getTime()) || (isDateOnly && date.toISOString().slice(0, 10) !== raw)) {
      throw new BadRequestException(`${field} is not a valid calendar date.`);
    }
    return date;
  }

  private assertAdmin(user: AuthenticatedUser): void {
    if (user.role !== UserRole.ADMIN) {
      throw new ForbiddenException('Administrator access is required.');
    }
  }
}
