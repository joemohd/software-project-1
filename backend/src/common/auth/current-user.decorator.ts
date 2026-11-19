import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtUser } from './jwt-user.interface.js';

/**
 * Injects the authenticated user (decoded JWT) into a controller handler.
 * Usage: `@CurrentUser() user: JwtUser`
 *
 * Returns `undefined` on routes that are public / optionally-authenticated
 * when no valid token is present.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtUser | undefined => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtUser }>();
    return request.user;
  },
);
