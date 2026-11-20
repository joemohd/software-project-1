import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AdminAction, AuditTargetType } from '../database/schemas/audit-log.schema.js';
import { PostStatus } from '../database/schemas/blog-post.schema.js';
import { ModeratedContentType, ReportResolution, ReportStatus } from '../database/schemas/report.schema.js';
import { UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import { AdminModerationService } from './admin-moderation.service.js';

const adminId = new Types.ObjectId();
const reporterId = new Types.ObjectId();
const authorId = new Types.ObjectId();
const targetId = new Types.ObjectId();
const reportId = new Types.ObjectId();
const session = { id: 'tx-session' };

const admin = {
  id: adminId.toString(),
  role: UserRole.ADMIN,
  status: UserActivityStatus.ACTIVE,
  isVerified: true,
};

const chainQuery = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = {
    exec: vi.fn().mockResolvedValue(result),
    distinct: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue(result) }),
  };
  for (const method of ['select', 'sort', 'skip', 'limit', 'session', 'lean']) {
    q[method] = vi.fn().mockReturnValue(q);
  }
  return q;
};

describe('AdminModerationService (GEN-07, GEN-09, GEN-10)', () => {
  let service: AdminModerationService;
  let auditLogModel: Record<string, ReturnType<typeof vi.fn>>;
  let reportModel: Record<string, ReturnType<typeof vi.fn>>;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let postModel: Record<string, ReturnType<typeof vi.fn>>;
  let postLikeModel: Record<string, ReturnType<typeof vi.fn>>;
  let commentModel: Record<string, ReturnType<typeof vi.fn>>;
  let itineraryModel: Record<string, ReturnType<typeof vi.fn>>;
  let clonebaseItineraryModel: Record<string, ReturnType<typeof vi.fn>>;
  let hotelBookingModel: Record<string, ReturnType<typeof vi.fn>>;
  let roomModel: Record<string, ReturnType<typeof vi.fn>>;
  let hotelModel: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    auditLogModel = {
      find: vi.fn(() =>
        chainQuery([
          {
            _id: new Types.ObjectId(),
            adminId,
            action: AdminAction.DELETE_CONTENT,
            targetType: AuditTargetType.POST,
            targetId,
            reason: 'Spam removed',
            metadata: { contentType: 'post' },
            createdAt: new Date('2026-11-20T10:00:00Z'),
          },
        ]),
      ),
      countDocuments: vi.fn(() => chainQuery(1)),
      create: vi.fn().mockResolvedValue([]),
    };
    reportModel = {
      find: vi.fn(() =>
        chainQuery([
          {
            _id: reportId,
            reporterId,
            targetType: ModeratedContentType.POST,
            targetId,
            reason: 'Offensive post',
            status: ReportStatus.OPEN,
            resolvedBy: null,
            resolvedAt: null,
            resolutionNote: null,
            createdAt: new Date('2026-11-20T09:00:00Z'),
          },
        ]),
      ),
      countDocuments: vi.fn(() => chainQuery(1)),
      findById: vi.fn(() =>
        chainQuery({
          _id: reportId,
          reporterId,
          targetType: ModeratedContentType.POST,
          targetId,
          reason: 'Offensive post',
          status: ReportStatus.OPEN,
          resolvedBy: null,
          resolvedAt: null,
          resolutionNote: null,
          createdAt: new Date('2026-11-20T09:00:00Z'),
        }),
      ),
      updateOne: vi.fn(() => chainQuery({ modifiedCount: 1 })),
      updateMany: vi.fn(() => chainQuery({ modifiedCount: 1 })),
    };
    userModel = {
      find: vi.fn(() =>
        chainQuery([
          { _id: adminId, fullName: 'Admin User', email: 'admin@example.com' },
          { _id: reporterId, fullName: 'Reporter User', email: 'reporter@example.com' },
        ]),
      ),
    };
    postModel = {
      find: vi.fn(() =>
        chainQuery([{ _id: targetId, userId: authorId, title: 'Reported Post', status: PostStatus.PUBLISHED }]),
      ),
      findOneAndUpdate: vi.fn(() =>
        chainQuery({ _id: targetId, userId: authorId, title: 'Reported Post', status: PostStatus.ARCHIVED }),
      ),
      findOneAndDelete: vi.fn(() => chainQuery({ _id: targetId })),
      updateMany: vi.fn(() => chainQuery({ modifiedCount: 0 })),
    };
    postLikeModel = {
      deleteMany: vi.fn(() => chainQuery({ deletedCount: 2 })),
    };
    commentModel = {
      find: vi.fn(() => chainQuery([])),
      findOneAndUpdate: vi.fn(() => chainQuery({ _id: targetId, isHidden: true })),
      findOneAndDelete: vi.fn(() => chainQuery({ _id: targetId })),
      deleteMany: vi.fn(() => chainQuery({ deletedCount: 3 })),
    };
    itineraryModel = {
      find: vi.fn(() => chainQuery([])),
      findOneAndUpdate: vi.fn(() => chainQuery({ _id: targetId, isHidden: true })),
      findOneAndDelete: vi.fn(() => chainQuery({ _id: targetId })),
    };
    clonebaseItineraryModel = {
      deleteMany: vi.fn(() => chainQuery({ deletedCount: 1 })),
    };
    hotelBookingModel = {
      find: vi.fn(() => chainQuery([])),
      findOneAndUpdate: vi.fn(() => chainQuery(null)),
    };
    roomModel = {
      findById: vi.fn(() => chainQuery(null)),
      find: vi.fn(() => chainQuery([])),
    };
    hotelModel = {
      updateOne: vi.fn(() => chainQuery({ modifiedCount: 1 })),
    };
    const connection = { transaction: vi.fn(async (work) => work(session)) };

    service = new AdminModerationService(
      auditLogModel as never,
      reportModel as never,
      userModel as never,
      postModel as never,
      postLikeModel as never,
      commentModel as never,
      itineraryModel as never,
      clonebaseItineraryModel as never,
      hotelBookingModel as never,
      roomModel as never,
      hotelModel as never,
      connection as never,
    );
  });

  describe('listAuditLogs (GEN-07)', () => {
    it('returns paginated audit logs with actor information', async () => {
      const page = await service.listAuditLogs(admin, { page: 1 });
      expect(page.total).toBe(1);
      expect(page.pageSize).toBe(10);
      expect(page.items[0]).toMatchObject({
        adminId: adminId.toString(),
        admin: { id: adminId.toString(), fullName: 'Admin User', email: 'admin@example.com' },
        action: AdminAction.DELETE_CONTENT,
        targetType: AuditTargetType.POST,
        targetId: targetId.toString(),
      });
    });

    it('rejects non-admin callers with 403', async () => {
      await expect(
        service.listAuditLogs({ ...admin, role: UserRole.USER }, { page: 1 }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('rejects a date range where from > to with 400', async () => {
      await expect(
        service.listAuditLogs(admin, { page: 1, from: '2026-12-10', to: '2026-12-01' }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listReports (GEN-09, GEN-10)', () => {
    it('lists open reports by default with reporter and content preview', async () => {
      const page = await service.listReports(admin, { page: 1, status: ReportStatus.OPEN });
      expect(reportModel.find).toHaveBeenCalledWith({ status: ReportStatus.OPEN });
      expect(page.items[0]).toMatchObject({
        id: reportId.toString(),
        reporter: { id: reporterId.toString(), fullName: 'Reporter User', email: 'reporter@example.com' },
        targetType: ModeratedContentType.POST,
        target: {
          exists: true,
          authorId: authorId.toString(),
          summary: 'Reported Post',
          isHidden: false,
        },
        status: ReportStatus.OPEN,
      });
    });
  });

  describe('resolveReport (GEN-10, GEN-07)', () => {
    it('dismisses an open report and writes an audit log entry', async () => {
      const result = await service.resolveReport(admin, reportId.toString(), {
        action: ReportResolution.DISMISS,
        note: 'False alarm',
      });

      expect(result.status).toBe(ReportStatus.DISMISSED);
      expect(result.resolutionNote).toBe('False alarm');
      expect(auditLogModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            adminId,
            action: AdminAction.DISMISS_REPORT,
            targetType: AuditTargetType.REPORT,
            targetId: reportId,
            reason: 'False alarm',
          }),
        ],
        { session },
      );
    });

    it('hides the reported post (sets status to ARCHIVED), resolves open reports on it, and writes an audit log', async () => {
      const result = await service.resolveReport(admin, reportId.toString(), {
        action: ReportResolution.HIDE,
        note: 'Hidden for review',
      });

      expect(postModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: targetId },
        { $set: { status: PostStatus.ARCHIVED } },
        { session, returnDocument: 'after' },
      );
      expect(reportModel.updateMany).toHaveBeenCalledWith(
        { targetType: ModeratedContentType.POST, targetId, status: ReportStatus.OPEN },
        expect.objectContaining({
          $set: expect.objectContaining({ status: ReportStatus.HIDDEN, resolvedBy: adminId }),
        }),
        { session },
      );
      expect(result.status).toBe(ReportStatus.HIDDEN);
      expect(auditLogModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            action: AdminAction.HIDE_CONTENT,
            targetType: AuditTargetType.POST,
            targetId,
          }),
        ],
        { session },
      );
    });

    it('rejects resolving an already-resolved report with 409', async () => {
      reportModel.findById.mockReturnValue(
        chainQuery({
          _id: reportId,
          reporterId,
          targetType: ModeratedContentType.POST,
          targetId,
          reason: 'Spam',
          status: ReportStatus.DISMISSED,
        }),
      );

      await expect(
        service.resolveReport(admin, reportId.toString(), { action: ReportResolution.DELETE }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('deleteContent (GEN-10, GEN-07)', () => {
    it('deletes a post, cascades comments and likes, resolves open reports, and logs the action', async () => {
      const res = await service.deleteContent(admin, ModeratedContentType.POST, targetId.toString(), 'Spam post');

      expect(res.deleted).toBe(true);
      expect(postModel.findOneAndDelete).toHaveBeenCalledWith({ _id: targetId }, { session });
      expect(commentModel.deleteMany).toHaveBeenCalledWith({ postId: targetId }, { session });
      expect(postLikeModel.deleteMany).toHaveBeenCalledWith({ postId: targetId }, { session });
      expect(reportModel.updateMany).toHaveBeenCalledWith(
        { targetType: ModeratedContentType.POST, targetId, status: ReportStatus.OPEN },
        expect.any(Object),
        { session },
      );
      expect(auditLogModel.create).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            adminId,
            action: AdminAction.DELETE_CONTENT,
            targetType: AuditTargetType.POST,
            targetId,
            reason: 'Spam post',
          }),
        ],
        { session },
      );
    });

    it('deletes an embedded hotel review and recalculates the hotel average rating', async () => {
      const roomId = new Types.ObjectId();
      const hotelId = new Types.ObjectId();
      hotelBookingModel.findOneAndUpdate.mockReturnValue(
        chainQuery({
          _id: new Types.ObjectId(),
          userId: authorId,
          rooms: [{ roomId }],
          review: { _id: targetId, rating: 1, comment: 'Abusive review' },
        }),
      );
      roomModel.findById.mockReturnValue(chainQuery({ _id: roomId, hotelId }));
      roomModel.find.mockReturnValue({
        session: vi.fn().mockReturnValue({
          distinct: vi.fn().mockReturnValue({ exec: vi.fn().mockResolvedValue([roomId]) }),
        }),
      });
      hotelBookingModel.find.mockReturnValue(
        chainQuery([{ review: { rating: 4 } }, { review: { rating: 5 } }]),
      );

      const res = await service.deleteContent(admin, ModeratedContentType.REVIEW, targetId.toString());

      expect(res.deleted).toBe(true);
      expect(hotelBookingModel.findOneAndUpdate).toHaveBeenCalledWith(
        { 'review._id': targetId },
        { $set: { review: null }, $unset: { rating: 1 } },
        { session, returnDocument: 'before' },
      );
      expect(hotelModel.updateOne).toHaveBeenCalledWith(
        { _id: hotelId },
        { $set: { averageRating: 4.5 } },
        { session },
      );
    });

    it('returns 404 when the target content does not exist', async () => {
      postModel.findOneAndDelete.mockReturnValue(chainQuery(null));

      await expect(
        service.deleteContent(admin, ModeratedContentType.POST, targetId.toString()),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
