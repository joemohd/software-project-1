import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserActivityStatus, UserRole } from '../../database/schemas/user.schema.js';
import type { AuthenticatedUser } from '../auth.types.js';
import { RolesGuard } from './roles.guard.js';

const contextFor = (user?: AuthenticatedUser) =>
  ({
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  }) as unknown as ExecutionContext;

const userWithRole = (role: UserRole): AuthenticatedUser => ({
  id: '507f1f77bcf86cd799439011',
  role,
  status: UserActivityStatus.ACTIVE,
});

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows any request when no roles are required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(contextFor())).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN, UserRole.HOTEL_MODERATOR]);
    expect(guard.canActivate(contextFor(userWithRole(UserRole.HOTEL_MODERATOR)))).toBe(true);
  });

  it('keeps hotel and airline moderators apart', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.HOTEL_MODERATOR]);
    expect(() => guard.canActivate(contextFor(userWithRole(UserRole.AIRLINE_MODERATOR)))).toThrow(ForbiddenException);
  });

  it('rejects a user whose role is not listed', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(contextFor(userWithRole(UserRole.USER)))).toThrow(ForbiddenException);
  });

  it('fails closed when roles are required but no user is attached', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue([UserRole.ADMIN]);
    expect(() => guard.canActivate(contextFor())).toThrow(UnauthorizedException);
  });
});
