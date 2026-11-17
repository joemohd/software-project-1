import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedUser } from '../auth.types.js';

/**
 * Injects the authenticated user (or one of its fields) into a handler parameter.
 *
 * @example getProfile(@CurrentUser() user: AuthenticatedUser)
 * @example listMyBookings(@CurrentUser('id') userId: string)
 */
export const CurrentUser = createParamDecorator(
  (field: keyof AuthenticatedUser | undefined, context: ExecutionContext) => {
    const user = context.switchToHttp().getRequest<AuthenticatedRequest>().user;
    return field ? user?.[field] : user;
  },
);
