import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { AdminAction, AuditTargetType } from '../database/schemas/audit-log.schema.js';
import { BookingStatus } from '../database/schemas/expense.schema.js';
import { ProviderStatus } from '../database/schemas/provider.schema.js';
import { UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import { AdminService } from './admin.service.js';
import { AdminProviderType } from './dto/admin-accounts.dto.js';
import { AdminBookingType } from './dto/admin-bookings.dto.js';

const targetId = new Types.ObjectId();
const admin = { id: new Types.ObjectId().toString(), role: UserRole.ADMIN, status: UserActivityStatus.ACTIVE, isVerified: true };
const session = { id: 'test-session' };
const query = (result: unknown) => ({
  select: vi.fn().mockReturnThis(),
  sort: vi.fn().mockReturnThis(),
  skip: vi.fn().mockReturnThis(),
  limit: vi.fn().mockReturnThis(),
  session: vi.fn().mockReturnThis(),
  lean: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue(result),
});

describe('AdminService', () => {
  let service: AdminService;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let resetModel: Record<string, ReturnType<typeof vi.fn>>;
  let refreshModel: Record<string, ReturnType<typeof vi.fn>>;
  let auditLogModel: Record<string, ReturnType<typeof vi.fn>>;
  let providerModel: Record<string, ReturnType<typeof vi.fn>>;
  let airlineModel: Record<string, ReturnType<typeof vi.fn>>;
  let hotelModel: Record<string, ReturnType<typeof vi.fn>>;
  let roomModel: Record<string, ReturnType<typeof vi.fn>>;
  let flightModel: Record<string, ReturnType<typeof vi.fn>>;
  let flightBookingModel: Record<string, ReturnType<typeof vi.fn>>;
  let hotelBookingModel: Record<string, ReturnType<typeof vi.fn>>;
  let countryModel: Record<string, ReturnType<typeof vi.fn>>;
  let mailService: { send: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    userModel = {
      findById: vi.fn(() => query({ _id: targetId, fullName: 'Mona', emailAddress: 'mona@example.com', username: 'mona', role: UserRole.USER, status: UserActivityStatus.ACTIVE, isVerified: true })),
      find: vi.fn(() => query([])),
      countDocuments: vi.fn(() => query(0)),
      exists: vi.fn(() => query(null)),
      create: vi.fn(async (docs: Record<string, unknown>[]) =>
        docs.map((doc) => ({
          _id: targetId,
          createdAt: new Date('2026-11-20T12:00:00.000Z'),
          ...doc,
          toObject: () => ({ _id: targetId, createdAt: new Date('2026-11-20T12:00:00.000Z'), ...doc }),
        })),
      ),
      updateOne: vi.fn(() => query({ matchedCount: 1 })),
    };
    resetModel = { deleteMany: vi.fn(() => query({ deletedCount: 1 })) };
    refreshModel = { deleteMany: vi.fn(() => query({ deletedCount: 1 })) };
    auditLogModel = { create: vi.fn(async (docs: unknown[]) => docs) };
    providerModel = { find: vi.fn(() => query([])), findById: vi.fn(() => query(null)), updateOne: vi.fn(() => query({ matchedCount: 1 })) };
    airlineModel = {
      find: vi.fn(() => query([])),
      findById: vi.fn(() => query(null)),
      exists: vi.fn(() => query(null)),
      updateOne: vi.fn(() => query({ matchedCount: 1 })),
    };
    hotelModel = {
      find: vi.fn(() => query([])),
      findById: vi.fn(() => query(null)),
      exists: vi.fn(() => query(null)),
      updateOne: vi.fn(() => query({ matchedCount: 1 })),
    };
    roomModel = { find: vi.fn(() => query([])) };
    flightModel = { find: vi.fn(() => query([])) };
    flightBookingModel = { find: vi.fn(() => query([])) };
    hotelBookingModel = { find: vi.fn(() => query([])) };
    countryModel = {
      findOne: vi.fn(() => query({ _id: new Types.ObjectId() })),
      exists: vi.fn(() => query({ _id: new Types.ObjectId() })),
    };
    mailService = { send: vi.fn().mockResolvedValue(true) };
    const connection = { transaction: vi.fn(async (work) => work(session)) };
    service = new AdminService(
      userModel as never,
      resetModel as never,
      refreshModel as never,
      connection as never,
      auditLogModel as never,
      providerModel as never,
      airlineModel as never,
      hotelModel as never,
      roomModel as never,
      flightModel as never,
      flightBookingModel as never,
      hotelBookingModel as never,
      countryModel as never,
      mailService as never,
    );
  });

  describe('resetUserPassword (ACC-07a)', () => {
    it.each([UserRole.USER, UserRole.HOTEL_MODERATOR, UserRole.AIRLINE_MODERATOR])('resets a %s and invalidates old credentials', async (role) => {
      userModel.findById.mockReturnValue(query({ _id: targetId, role }));
      const result = await service.resetUserPassword(admin, targetId.toString(), { temporaryPassword: 'Temporary123' });
      const update = userModel.updateOne.mock.calls[0][1];
      expect(await bcrypt.compare('Temporary123', update.$set.passwordHash)).toBe(true);
      expect(update.$set).toMatchObject({ mustChangePassword: true, loginAttempts: 0, loginAttemptsResetAt: null });
      expect(update.$inc).toEqual({ sessionVersion: 1 });
      expect(refreshModel.deleteMany).toHaveBeenCalledWith({ userId: targetId }, { session });
      expect(resetModel.deleteMany).toHaveBeenCalledWith({ userId: targetId }, { session });
      expect(JSON.stringify(result)).not.toContain('Temporary123');
    });

    it('rejects a non-admin caller without changing credentials', async () => {
      await expect(service.resetUserPassword({ ...admin, role: UserRole.USER }, targetId.toString(), {
        temporaryPassword: 'Temporary123',
      })).rejects.toThrow(ForbiddenException);
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('does not reset another administrator', async () => {
      userModel.findById.mockReturnValue(query({ _id: targetId, role: UserRole.ADMIN }));
      await expect(service.resetUserPassword(admin, targetId.toString(), { temporaryPassword: 'Temporary123' })).rejects.toThrow(ForbiddenException);
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('returns 404 for an unknown target', async () => {
      userModel.findById.mockReturnValue(query(null));
      await expect(service.resetUserPassword(admin, targetId.toString(), { temporaryPassword: 'Temporary123' })).rejects.toThrow(NotFoundException);
    });
  });

  describe('createModerator (ACC-13)', () => {
    const hotelId = new Types.ObjectId();

    it('creates a moderator account linked to a provider with mustChangePassword=true and logs an audit entry', async () => {
      hotelModel.findById.mockReturnValue(query({ _id: hotelId, name: 'Nile Hotel', status: ProviderStatus.ACTIVE }));
      const result = await service.createModerator(admin, {
        fullName: 'Karim Nabil',
        emailAddress: 'Karim@Example.com',
        role: UserRole.HOTEL_MODERATOR,
        temporaryPassword: 'Temporary123',
        providerId: hotelId.toString(),
      });

      expect(result).toMatchObject({
        id: targetId.toString(),
        fullName: 'Karim Nabil',
        emailAddress: 'karim@example.com',
        role: UserRole.HOTEL_MODERATOR,
        status: UserActivityStatus.ACTIVE,
        mustChangePassword: true,
        providerId: hotelId.toString(),
      });
      const createdDoc = userModel.create.mock.calls[0][0][0];
      expect(await bcrypt.compare('Temporary123', createdDoc.passwordHash)).toBe(true);
      expect(createdDoc.mustChangePassword).toBe(true);
      expect(hotelModel.updateOne).toHaveBeenCalledWith({ _id: hotelId }, { $set: { moderatorId: targetId } }, { session });
      expect(auditLogModel.create).toHaveBeenCalledWith(
        [expect.objectContaining({ action: AdminAction.CREATE_MODERATOR, targetType: AuditTargetType.USER, targetId })],
        { session },
      );
      expect(mailService.send).toHaveBeenCalledTimes(1);
    });

    it('rejects duplicate email with 409', async () => {
      userModel.exists.mockReturnValueOnce(query({ _id: new Types.ObjectId() }));
      await expect(
        service.createModerator(admin, {
          fullName: 'Karim',
          emailAddress: 'taken@example.com',
          role: UserRole.HOTEL_MODERATOR,
          temporaryPassword: 'Temporary123',
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('rejects a providerId that belongs to the opposite provider type with 400', async () => {
      hotelModel.findById.mockReturnValue(query(null));
      airlineModel.exists.mockReturnValue(query({ _id: hotelId }));
      await expect(
        service.createModerator(admin, {
          fullName: 'Karim',
          emailAddress: 'karim@example.com',
          role: UserRole.HOTEL_MODERATOR,
          temporaryPassword: 'Temporary123',
          providerId: hotelId.toString(),
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('listAccounts (ACC-14)', () => {
    it('searches by name or email, filters by role and status, and paginates 10 per page', async () => {
      const modId = new Types.ObjectId();
      const hotelId = new Types.ObjectId();
      userModel.find.mockReturnValue(
        query([
          {
            _id: modId,
            fullName: 'Karim Nabil',
            emailAddress: 'karim@example.com',
            username: 'karim',
            role: UserRole.HOTEL_MODERATOR,
            status: UserActivityStatus.ACTIVE,
            isVerified: true,
            mustChangePassword: false,
            createdAt: new Date('2026-11-20T10:00:00Z'),
          },
        ]),
      );
      userModel.countDocuments.mockReturnValue(query(1));
      providerModel.find.mockReturnValue(query([{ _id: hotelId, moderatorId: modId }]));

      const result = await service.listAccounts(admin, {
        page: 1,
        search: 'karim',
        role: UserRole.HOTEL_MODERATOR,
        status: UserActivityStatus.ACTIVE,
      });

      expect(userModel.find).toHaveBeenCalledWith({
        role: UserRole.HOTEL_MODERATOR,
        status: UserActivityStatus.ACTIVE,
        $or: [
          { fullName: { $regex: 'karim', $options: 'i' } },
          { emailAddress: { $regex: 'karim', $options: 'i' } },
        ],
      });
      expect(result).toMatchObject({
        page: 1,
        pageSize: 10,
        total: 1,
        totalPages: 1,
        items: [expect.objectContaining({ id: modId.toString(), providerId: hotelId.toString() })],
      });
    });
  });

  describe('suspendAccount & reactivateAccount (ACC-15, ACC-16)', () => {
    it('suspends an active user or moderator, revokes sessions and writes an audit log', async () => {
      const result = await service.suspendAccount(admin, targetId.toString(), { reason: 'Abusive content' });
      expect(result.status).toBe(UserActivityStatus.SUSPENDED);
      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: targetId },
        { $set: { status: UserActivityStatus.SUSPENDED }, $inc: { sessionVersion: 1 } },
        { session },
      );
      expect(refreshModel.deleteMany).toHaveBeenCalledWith({ userId: targetId }, { session });
      expect(resetModel.deleteMany).toHaveBeenCalledWith({ userId: targetId }, { session });
      expect(auditLogModel.create).toHaveBeenCalledWith(
        [expect.objectContaining({ action: AdminAction.SUSPEND_USER, reason: 'Abusive content', targetId })],
        { session },
      );
    });

    it('rejects suspending an administrator or already-suspended account', async () => {
      userModel.findById.mockReturnValueOnce(query({ _id: targetId, role: UserRole.ADMIN, status: UserActivityStatus.ACTIVE }));
      await expect(service.suspendAccount(admin, targetId.toString())).rejects.toThrow(ForbiddenException);

      userModel.findById.mockReturnValueOnce(query({ _id: targetId, role: UserRole.USER, status: UserActivityStatus.SUSPENDED }));
      await expect(service.suspendAccount(admin, targetId.toString())).rejects.toThrow(ConflictException);
    });

    it('reactivates a suspended account, clears login attempts and writes an audit log', async () => {
      userModel.findById.mockReturnValueOnce(
        query({
          _id: targetId,
          fullName: 'Mona',
          emailAddress: 'mona@example.com',
          username: 'mona',
          role: UserRole.AIRLINE_MODERATOR,
          status: UserActivityStatus.SUSPENDED,
          isVerified: true,
        }),
      );
      const result = await service.reactivateAccount(admin, targetId.toString(), { reason: 'Appeal accepted' });
      expect(result.status).toBe(UserActivityStatus.ACTIVE);
      expect(userModel.updateOne).toHaveBeenCalledWith(
        { _id: targetId },
        { $set: { status: UserActivityStatus.ACTIVE, loginAttempts: 0, loginAttemptsResetAt: null } },
        { session },
      );
      expect(auditLogModel.create).toHaveBeenCalledWith(
        [expect.objectContaining({ action: AdminAction.REACTIVATE_USER, reason: 'Appeal accepted', targetId })],
        { session },
      );
    });
  });

  describe('deactivateProvider & reactivateProvider (ACC-15)', () => {
    const providerId = new Types.ObjectId();
    const modId = new Types.ObjectId();

    it('deactivates and reactivates a hotel or airline and writes audit logs', async () => {
      hotelModel.findById.mockReturnValueOnce(
        query({ _id: providerId, name: 'Nile View Hotel', status: ProviderStatus.ACTIVE, moderatorId: modId }),
      );
      const deactivated = await service.deactivateProvider(admin, AdminProviderType.HOTEL, providerId.toString(), {
        reason: 'Policy review',
      });
      expect(deactivated).toMatchObject({
        id: providerId.toString(),
        type: AdminProviderType.HOTEL,
        status: ProviderStatus.DEACTIVATED,
      });
      expect(auditLogModel.create).toHaveBeenCalledWith(
        [expect.objectContaining({ action: AdminAction.DEACTIVATE_PROVIDER, targetType: AuditTargetType.HOTEL, targetId: providerId })],
        { session },
      );

      airlineModel.findById.mockReturnValueOnce(
        query({ _id: providerId, name: 'EgyptAir', status: ProviderStatus.DEACTIVATED, moderatorId: modId }),
      );
      const reactivated = await service.reactivateProvider(admin, AdminProviderType.AIRLINE, providerId.toString());
      expect(reactivated).toMatchObject({
        id: providerId.toString(),
        type: AdminProviderType.AIRLINE,
        status: ProviderStatus.ACTIVE,
      });
    });

    it('rejects deactivating an already deactivated provider with 409', async () => {
      hotelModel.findById.mockReturnValueOnce(
        query({ _id: providerId, name: 'Nile View Hotel', status: ProviderStatus.DEACTIVATED, moderatorId: modId }),
      );
      await expect(service.deactivateProvider(admin, AdminProviderType.HOTEL, providerId.toString())).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe('listBookings (ACC-17)', () => {
    it('lists flight and hotel bookings with user, provider, dates, amount and status, and filters by type/date range', async () => {
      const userId = new Types.ObjectId();
      const flightId = new Types.ObjectId();
      const airlineId = new Types.ObjectId();
      const roomId = new Types.ObjectId();
      const hotelId = new Types.ObjectId();
      const fbId = new Types.ObjectId();
      const hbId = new Types.ObjectId();

      flightBookingModel.find.mockReturnValue(
        query([
          {
            _id: fbId,
            userId,
            reference: 'K7M2QX',
            status: BookingStatus.CONFIRMED,
            cost: 95000,
            segments: [{ flightId }],
            createdAt: new Date('2026-11-20T10:00:00Z'),
          },
        ]),
      );
      hotelBookingModel.find.mockReturnValue(
        query([
          {
            _id: hbId,
            userId,
            status: BookingStatus.CONFIRMED,
            cost: 60000,
            startDate: new Date('2026-12-10T00:00:00Z'),
            nightsCount: 3,
            rooms: [{ roomId, guestAges: [18, 18] }],
            createdAt: new Date('2026-11-20T11:00:00Z'),
          },
        ]),
      );
      userModel.find.mockReturnValue(query([{ _id: userId, fullName: 'Mona Hassan', emailAddress: 'mona@example.com' }]));
      flightModel.find.mockReturnValue(
        query([
          {
            _id: flightId,
            airlineId,
            departure: { timestamp: new Date('2026-12-01T08:00:00Z') },
            arrival: { timestamp: new Date('2026-12-01T14:00:00Z') },
          },
        ]),
      );
      airlineModel.find.mockReturnValue(query([{ _id: airlineId, name: 'EgyptAir' }]));
      roomModel.find.mockReturnValue(query([{ _id: roomId, hotelId }]));
      hotelModel.find.mockReturnValue(query([{ _id: hotelId, name: 'Nile View Hotel' }]));

      const all = await service.listBookings(admin, { page: 1 });
      expect(all.total).toBe(2);
      expect(all.items[0]).toMatchObject({
        id: hbId.toString(),
        type: AdminBookingType.HOTEL,
        reference: hbId.toString(),
        amount: 60000,
        provider: { id: hotelId.toString(), type: AdminProviderType.HOTEL, name: 'Nile View Hotel' },
      });
      expect(all.items[1]).toMatchObject({
        id: fbId.toString(),
        type: AdminBookingType.FLIGHT,
        reference: 'K7M2QX',
        amount: 95000,
        provider: { id: airlineId.toString(), type: AdminProviderType.AIRLINE, name: 'EgyptAir' },
      });

      const filtered = await service.listBookings(admin, {
        page: 1,
        from: '2026-12-01',
        to: '2026-12-05',
      });
      expect(filtered.total).toBe(1);
      expect(filtered.items[0].id).toBe(fbId.toString());

      await expect(service.listBookings(admin, { page: 1, from: '2026-12-10', to: '2026-12-01' })).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
