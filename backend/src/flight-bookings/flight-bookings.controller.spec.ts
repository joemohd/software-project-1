import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import { FlightBookingsController } from './flight-bookings.controller.js';

// FLT-19: only registered users book flights; the real RolesGuard reads the real @Roles() metadata of the handler
describe('FlightBookingsController roles', () => {
  const guard = new RolesGuard(new Reflector());
  // The handler function itself (the guard only reads its metadata), taken without calling it unbound
  const createHandler = Object.getOwnPropertyDescriptor(FlightBookingsController.prototype, 'create')?.value as () => unknown;
  const contextFor = (role: UserRole, isVerified = true) =>
    ({
      getHandler: () => createHandler,
      getClass: () => FlightBookingsController,
      switchToHttp: () => ({
        getRequest: () => ({ user: { id: '507f1f77bcf86cd799439011', role, status: UserActivityStatus.ACTIVE, isVerified } }),
      }),
    }) as unknown as ExecutionContext;

  it('lets a registered user create a booking, verified or not', () => {
    expect(guard.canActivate(contextFor(UserRole.USER))).toBe(true);
    expect(guard.canActivate(contextFor(UserRole.USER, false))).toBe(true);
  });

  it.each([UserRole.MODERATOR, UserRole.ADMIN])('rejects a %s with 403', (role) => {
    expect(() => guard.canActivate(contextFor(role))).toThrow(ForbiddenException);
  });
});
