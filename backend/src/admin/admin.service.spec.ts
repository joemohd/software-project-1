import { ForbiddenException, NotFoundException } from '@nestjs/common';
import bcrypt from 'bcrypt';
import { Types } from 'mongoose';
import { UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import { AdminService } from './admin.service.js';
import { AdminAction } from './schemas/audit-log.schema.js';

const targetId = new Types.ObjectId();
const admin = { id: new Types.ObjectId().toString(), role: UserRole.ADMIN, status: UserActivityStatus.ACTIVE, isVerified: true };
const session = { id: 'test-session' };
const query = (result: unknown) => ({
  session: vi.fn().mockReturnThis(), lean: vi.fn().mockReturnThis(), exec: vi.fn().mockResolvedValue(result),
});

describe('AdminService.resetUserPassword (ACC-07a)', () => {
  let service: AdminService;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let resetModel: Record<string, ReturnType<typeof vi.fn>>;
  let refreshModel: Record<string, ReturnType<typeof vi.fn>>;
  let auditModel: Record<string, ReturnType<typeof vi.fn>>;

  beforeEach(() => {
    userModel = {
      findById: vi.fn(() => query({ _id: targetId, role: UserRole.USER })),
      updateOne: vi.fn(() => query({ matchedCount: 1 })),
    };
    resetModel = { deleteMany: vi.fn(() => query({ deletedCount: 1 })) };
    refreshModel = { deleteMany: vi.fn(() => query({ deletedCount: 1 })) };
    auditModel = { create: vi.fn().mockResolvedValue([]) };
    const connection = { transaction: vi.fn(async (work) => work(session)) };
    service = new AdminService(userModel as never, resetModel as never, refreshModel as never, auditModel as never, connection as never);
  });

  it.each([UserRole.USER, UserRole.HOTEL_MODERATOR, UserRole.AIRLINE_MODERATOR])('resets a %s and invalidates old credentials', async (role) => {
    userModel.findById.mockReturnValue(query({ _id: targetId, role }));
    const result = await service.resetUserPassword(admin, targetId.toString(), { temporaryPassword: 'Temporary123' });
    const update = userModel.updateOne.mock.calls[0][1];
    expect(await bcrypt.compare('Temporary123', update.$set.passwordHash)).toBe(true);
    expect(update.$set).toMatchObject({ mustChangePassword: true, loginAttempts: 0, loginAttemptsResetAt: null });
    expect(update.$inc).toEqual({ sessionVersion: 1 });
    expect(refreshModel.deleteMany).toHaveBeenCalledWith({ userId: targetId }, { session });
    expect(resetModel.deleteMany).toHaveBeenCalledWith({ userId: targetId }, { session });
    expect(auditModel.create).toHaveBeenCalledWith([{
      adminId: new Types.ObjectId(admin.id), targetUserId: targetId, action: AdminAction.RESET_PASSWORD,
    }], { session });
    expect(JSON.stringify(result)).not.toContain('Temporary123');
    expect(JSON.stringify(auditModel.create.mock.calls)).not.toContain('Temporary123');
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
    expect(auditModel.create).not.toHaveBeenCalled();
  });

  it('fails the transaction if the audit entry cannot be saved', async () => {
    auditModel.create.mockRejectedValue(new Error('audit write failed'));
    await expect(service.resetUserPassword(admin, targetId.toString(), { temporaryPassword: 'Temporary123' })).rejects.toThrow('audit write failed');
  });
});
