import { BadRequestException, ForbiddenException, HttpStatus, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { Types } from 'mongoose';
import { UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import { AuthService } from './auth.service.js';

const PASSWORD = 'Correct123';
const userId = new Types.ObjectId();
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

/** Mimics a mongoose query: chainable select/lean, resolved by exec(). */
const query = (result: unknown) => {
  const q = { select: vi.fn(), lean: vi.fn(), exec: vi.fn().mockResolvedValue(result) };
  q.select.mockReturnValue(q);
  q.lean.mockReturnValue(q);
  return q;
};
const write = (result: unknown = { matchedCount: 1 }) => ({ exec: vi.fn().mockResolvedValue(result) });

const config = {
  jwtSecret: 'test-secret',
  jwtExpiresInSeconds: 900,
  refreshTokenIdleSeconds: 1800,
  cookieSecure: true,
  frontendUrl: 'http://localhost:3001',
};

describe('AuthService', () => {
  let passwordHash: string;
  let userModel: Record<string, ReturnType<typeof vi.fn>>;
  let countryModel: Record<string, ReturnType<typeof vi.fn>>;
  let passwordResetTokenModel: Record<string, ReturnType<typeof vi.fn>>;
  let refreshTokenModel: Record<string, ReturnType<typeof vi.fn>>;
  let service: AuthService;

  const userRecord = (overrides: Record<string, unknown> = {}) => ({
    _id: userId,
    fullName: 'Test User',
    emailAddress: 'test@example.com',
    username: 'test',
    role: UserRole.USER,
    status: UserActivityStatus.ACTIVE,
    isVerified: true,
    passwordHash,
    loginAttempts: 0,
    loginAttemptsResetAt: null,
    ...overrides,
  });

  const login = (password = PASSWORD) => service.login({ emailAddress: ' Test@Example.com ', password });
  const lastUserUpdate = () => userModel.updateOne.mock.calls.at(-1)?.[1].$set;

  beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
  });

  beforeEach(() => {
    userModel = { findOne: vi.fn(), findById: vi.fn(), exists: vi.fn(), create: vi.fn(), updateOne: vi.fn(() => write()) };
    countryModel = { exists: vi.fn() };
    passwordResetTokenModel = { updateOne: vi.fn(() => write()), findOneAndDelete: vi.fn() };
    refreshTokenModel = {
      create: vi.fn().mockResolvedValue({}),
      findOneAndDelete: vi.fn(),
      deleteOne: vi.fn(() => write()),
      deleteMany: vi.fn(() => write()),
    };
    service = new AuthService(
      userModel as never,
      countryModel as never,
      passwordResetTokenModel as never,
      refreshTokenModel as never,
      new JwtService({ secret: config.jwtSecret, signOptions: { expiresIn: config.jwtExpiresInSeconds } }),
      config,
    );
  });

  describe('login (ACC-04, ACC-05)', () => {
    it('looks up the email case-insensitively', async () => {
      userModel.findOne.mockReturnValue(query(userRecord()));
      await login();
      expect(userModel.findOne).toHaveBeenCalledWith({ emailAddress: 'test@example.com' });
    });

    it('gives the same generic error for an unknown email', async () => {
      userModel.findOne.mockReturnValue(query(null));
      await expect(login()).rejects.toThrow(new UnauthorizedException('Invalid email or password.'));
    });

    it('gives the generic error and counts the failure on a wrong password', async () => {
      userModel.findOne.mockReturnValue(query(userRecord({ loginAttempts: 2 })));
      await expect(login('Wrong1234')).rejects.toThrow(new UnauthorizedException('Invalid email or password.'));
      expect(lastUserUpdate()).toEqual({ loginAttempts: 3, loginAttemptsResetAt: null });
    });

    it('locks the account for 15 minutes on the 5th consecutive failure', async () => {
      userModel.findOne.mockReturnValue(query(userRecord({ loginAttempts: 4 })));
      const before = Date.now();

      await expect(login('Wrong1234')).rejects.toMatchObject({ status: HttpStatus.LOCKED });

      const { loginAttempts, loginAttemptsResetAt } = lastUserUpdate();
      expect(loginAttempts).toBe(5);
      expect(loginAttemptsResetAt.getTime()).toBeGreaterThanOrEqual(before + 15 * 60_000);
    });

    it('rejects even the correct password while locked', async () => {
      const lockedUntil = new Date(Date.now() + 10 * 60_000);
      userModel.findOne.mockReturnValue(query(userRecord({ loginAttempts: 5, loginAttemptsResetAt: lockedUntil })));
      await expect(login()).rejects.toMatchObject({ status: HttpStatus.LOCKED });
      expect(refreshTokenModel.create).not.toHaveBeenCalled();
    });

    it('starts a fresh count after the lockout has expired', async () => {
      const expired = new Date(Date.now() - 1000);
      userModel.findOne.mockReturnValue(query(userRecord({ loginAttempts: 5, loginAttemptsResetAt: expired })));
      await expect(login('Wrong1234')).rejects.toThrow(UnauthorizedException);
      expect(lastUserUpdate()).toEqual({ loginAttempts: 1, loginAttemptsResetAt: null });
    });

    it('shows the suspended message only after a correct password', async () => {
      userModel.findOne.mockReturnValue(query(userRecord({ status: UserActivityStatus.SUSPENDED })));
      await expect(login()).rejects.toThrow(new ForbiddenException('Your account has been suspended.'));

      userModel.findOne.mockReturnValue(query(userRecord({ status: UserActivityStatus.SUSPENDED })));
      await expect(login('Wrong1234')).rejects.toThrow(new UnauthorizedException('Invalid email or password.'));
    });

    it('blocks a deactivated account', async () => {
      userModel.findOne.mockReturnValue(query(userRecord({ status: UserActivityStatus.INACTIVE })));
      await expect(login()).rejects.toThrow(ForbiddenException);
    });

    it('resets the counter and issues tokens on success, storing only the refresh-token hash', async () => {
      userModel.findOne.mockReturnValue(query(userRecord({ loginAttempts: 3 })));

      const session = await login();

      expect(lastUserUpdate()).toEqual({ loginAttempts: 0, loginAttemptsResetAt: null });
      expect(session.user).toEqual({
        id: userId.toString(),
        fullName: 'Test User',
        emailAddress: 'test@example.com',
        username: 'test',
        role: UserRole.USER,
        isVerified: true,
      });
      expect(session.user).not.toHaveProperty('passwordHash');
      const stored = refreshTokenModel.create.mock.calls[0][0];
      expect(stored.tokenHash).toBe(sha256(session.tokens.refreshToken));
      expect(stored.tokenHash).not.toBe(session.tokens.refreshToken);
    });
  });

  describe('refresh (ACC-06)', () => {
    it('rotates the refresh token', async () => {
      refreshTokenModel.findOneAndDelete.mockReturnValue(
        query({ userId, expiresAt: new Date(Date.now() + 60_000) }),
      );
      userModel.findById.mockReturnValue(query(userRecord()));

      const session = await service.refresh('old-token');

      expect(refreshTokenModel.findOneAndDelete).toHaveBeenCalledWith({ tokenHash: sha256('old-token') });
      expect(session.tokens.refreshToken).not.toBe('old-token');
      expect(refreshTokenModel.create).toHaveBeenCalledTimes(1);
    });

    it('rejects an idle-expired session', async () => {
      refreshTokenModel.findOneAndDelete.mockReturnValue(query({ userId, expiresAt: new Date(Date.now() - 1) }));
      await expect(service.refresh('old-token')).rejects.toThrow(UnauthorizedException);
    });

    it('rejects a missing cookie', async () => {
      await expect(service.refresh(undefined)).rejects.toThrow(UnauthorizedException);
    });

    it('revokes every session of a suspended user', async () => {
      refreshTokenModel.findOneAndDelete.mockReturnValue(
        query({ userId, expiresAt: new Date(Date.now() + 60_000) }),
      );
      userModel.findById.mockReturnValue(query(userRecord({ status: UserActivityStatus.SUSPENDED })));

      await expect(service.refresh('old-token')).rejects.toThrow(ForbiddenException);
      expect(refreshTokenModel.deleteMany).toHaveBeenCalledWith({ userId });
    });
  });

  describe('logout (ACC-06)', () => {
    it('revokes the refresh token on the server', async () => {
      await service.logout('token');
      expect(refreshTokenModel.deleteOne).toHaveBeenCalledWith({ tokenHash: sha256('token') });
    });
  });

  describe('forgotPassword / resetPassword (ACC-07)', () => {
    it('answers the same way for an unknown email without creating a token', async () => {
      userModel.findOne.mockReturnValue(query(null));
      const unknown = await service.forgotPassword({ emailAddress: 'nobody@example.com' });

      userModel.findOne.mockReturnValue(query(userRecord()));
      const known = await service.forgotPassword({ emailAddress: 'test@example.com' });

      expect(unknown).toEqual(known);
      expect(passwordResetTokenModel.updateOne).toHaveBeenCalledTimes(1);
    });

    it('replaces any previous token for the user (newer request invalidates the old link)', async () => {
      userModel.findOne.mockReturnValue(query(userRecord()));
      await service.forgotPassword({ emailAddress: 'test@example.com' });

      const [filter, update, options] = passwordResetTokenModel.updateOne.mock.calls[0];
      expect(filter).toEqual({ userId });
      expect(update.$set.tokenHash).toMatch(/^[a-f0-9]{64}$/);
      expect(options).toEqual({ upsert: true });
    });

    it('rejects an expired reset token', async () => {
      passwordResetTokenModel.findOneAndDelete.mockReturnValue(
        query({ userId, expiresAt: new Date(Date.now() - 1) }),
      );
      await expect(service.resetPassword({ token: 'abc', newPassword: 'NewPass123' })).rejects.toThrow(
        BadRequestException,
      );
      expect(userModel.updateOne).not.toHaveBeenCalled();
    });

    it('sets the new password, clears the lockout and logs out every session', async () => {
      passwordResetTokenModel.findOneAndDelete.mockReturnValue(
        query({ userId, expiresAt: new Date(Date.now() + 60_000) }),
      );

      await service.resetPassword({ token: 'abc', newPassword: 'NewPass123' });

      expect(passwordResetTokenModel.findOneAndDelete).toHaveBeenCalledWith({ tokenHash: sha256('abc') });
      const update = lastUserUpdate();
      expect(await bcrypt.compare('NewPass123', update.passwordHash)).toBe(true);
      expect(update).toMatchObject({ loginAttempts: 0, loginAttemptsResetAt: null });
      expect(refreshTokenModel.deleteMany).toHaveBeenCalledWith({ userId });
    });
  });

  describe('changePassword (ACC-08)', () => {
    const user = { id: userId.toString(), role: UserRole.USER, status: UserActivityStatus.ACTIVE, isVerified: true };

    it('rejects a wrong current password with 400 (not 401)', async () => {
      userModel.findById.mockReturnValue(query(userRecord()));
      await expect(
        service.changePassword(user, { currentPassword: 'Wrong1234', newPassword: 'NewPass123' }, 'rt'),
      ).rejects.toThrow(BadRequestException);
    });

    it('updates the hash and signs out every other session', async () => {
      userModel.findById.mockReturnValue(query(userRecord()));

      await service.changePassword(user, { currentPassword: PASSWORD, newPassword: 'NewPass123' }, 'current');

      expect(await bcrypt.compare('NewPass123', lastUserUpdate().passwordHash)).toBe(true);
      expect(refreshTokenModel.deleteMany).toHaveBeenCalledWith({
        userId,
        tokenHash: { $ne: sha256('current') },
      });
    });
  });

  describe('verifyEmail (ACC-02)', () => {
    it('rejects an access token used as a verification token', async () => {
      const accessToken = await new JwtService({ secret: config.jwtSecret }).signAsync({
        sub: userId.toString(),
        type: 'access',
      });
      await expect(service.verifyEmail({ token: accessToken })).rejects.toThrow(BadRequestException);
    });

    it('marks the user as verified', async () => {
      const token = await new JwtService({ secret: config.jwtSecret }).signAsync({
        sub: userId.toString(),
        type: 'verify-email',
      });
      await service.verifyEmail({ token });
      expect(userModel.updateOne).toHaveBeenCalledWith({ _id: userId.toString() }, { $set: { isVerified: true } });
    });
  });
});
