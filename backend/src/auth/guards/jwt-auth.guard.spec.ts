import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Types } from 'mongoose';
import { UserActivityStatus, UserRole } from '../../database/schemas/user.schema.js';
import { ACCESS_TOKEN_COOKIE } from '../auth.helper.js';
import type { AuthenticatedRequest } from '../auth.types.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';

const userId = new Types.ObjectId();

const contextFor = (request: Partial<AuthenticatedRequest>) =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  }) as unknown as ExecutionContext;

const requestWithCookie = (token: string) =>
  ({ cookies: { [ACCESS_TOKEN_COOKIE]: token } }) as Partial<AuthenticatedRequest>;

const userModelReturning = (user: unknown) => {
  const exec = vi.fn().mockResolvedValue(user);
  const query = { select: vi.fn().mockReturnThis(), lean: vi.fn().mockReturnThis(), exec };
  return { findById: vi.fn().mockReturnValue(query) };
};

describe('JwtAuthGuard', () => {
  const jwtService = new JwtService({ secret: 'test-secret' });
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(false);
  });

  const guardWith = (user: unknown) => {
    const userModel = userModelReturning(user);
    return { guard: new JwtAuthGuard(reflector, jwtService, userModel as never), userModel };
  };

  const validToken = () => jwtService.signAsync({ sub: userId.toString(), role: UserRole.USER, type: 'access' });

  it('lets @Public() routes through without a token', async () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(true);
    const { guard, userModel } = guardWith(null);
    await expect(guard.canActivate(contextFor({ cookies: {} }))).resolves.toBe(true);
    expect(userModel.findById).not.toHaveBeenCalled();
  });

  it('rejects a request without the access-token cookie', async () => {
    const { guard } = guardWith(null);
    await expect(guard.canActivate(contextFor({ cookies: {} }))).rejects.toThrow(UnauthorizedException);
  });

  it('ignores a Bearer header (tokens must come from the httpOnly cookie)', async () => {
    const { guard } = guardWith(null);
    const request = { cookies: {}, headers: { authorization: `Bearer ${await validToken()}` } };
    await expect(guard.canActivate(contextFor(request as never))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed with another secret', async () => {
    const { guard } = guardWith(null);
    const forged = await new JwtService({ secret: 'other-secret' }).signAsync({ sub: userId.toString(), type: 'access' });
    await expect(guard.canActivate(contextFor(requestWithCookie(forged)))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects an email-verification token used as an access token', async () => {
    const { guard } = guardWith({ _id: userId, role: UserRole.USER, status: UserActivityStatus.ACTIVE });
    const verifyToken = await jwtService.signAsync({ sub: userId.toString(), type: 'verify-email' });
    await expect(guard.canActivate(contextFor(requestWithCookie(verifyToken)))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects a token whose user no longer exists', async () => {
    const { guard } = guardWith(null);
    await expect(guard.canActivate(contextFor(requestWithCookie(await validToken())))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it.each([UserActivityStatus.SUSPENDED, UserActivityStatus.INACTIVE])('rejects a %s account', async (status) => {
    const { guard } = guardWith({ _id: userId, role: UserRole.USER, status, isVerified: true });
    await expect(guard.canActivate(contextFor(requestWithCookie(await validToken())))).rejects.toThrow(
      ForbiddenException,
    );
  });

  it('attaches the user with the role from the database, not the token', async () => {
    const { guard } = guardWith({
      _id: userId,
      role: UserRole.ADMIN,
      status: UserActivityStatus.ACTIVE,
      isVerified: false,
    });
    const request = requestWithCookie(await validToken());

    await expect(guard.canActivate(contextFor(request))).resolves.toBe(true);
    expect(request.user).toEqual({
      id: userId.toString(),
      role: UserRole.ADMIN,
      status: UserActivityStatus.ACTIVE,
      isVerified: false,
    });
  });

  it('rejects an access token issued before an administrator reset the password', async () => {
    const { guard } = guardWith({
      _id: userId, role: UserRole.USER, status: UserActivityStatus.ACTIVE, isVerified: true, sessionVersion: 1,
    });
    await expect(guard.canActivate(contextFor(requestWithCookie(await validToken())))).rejects.toThrow(UnauthorizedException);
  });

  it('accepts a new token after the required password change', async () => {
    const { guard } = guardWith({
      _id: userId, role: UserRole.USER, status: UserActivityStatus.ACTIVE, isVerified: true, sessionVersion: 1,
    });
    const token = await jwtService.signAsync({ sub: userId.toString(), type: 'access', sessionVersion: 1 });
    await expect(guard.canActivate(contextFor(requestWithCookie(token)))).resolves.toBe(true);
  });

  it('blocks private endpoints until the temporary password has been changed', async () => {
    const { guard } = guardWith({
      _id: userId, role: UserRole.USER, status: UserActivityStatus.ACTIVE, isVerified: true, mustChangePassword: true,
    });
    await expect(guard.canActivate(contextFor(requestWithCookie(await validToken())))).rejects.toMatchObject({
      status: 403, response: { mustChangePassword: true },
    });
  });
});
