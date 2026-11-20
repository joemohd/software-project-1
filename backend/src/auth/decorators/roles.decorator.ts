import { SetMetadata } from '@nestjs/common';
import { UserRole } from '../../database/schemas/user.schema.js';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route (or a whole controller) to the listed roles.
 * A method-level @Roles() overrides a controller-level one.
 * Routes without @Roles() are open to any authenticated user.
 *
 * @example @Roles(UserRole.ADMIN)
 * @example @Roles(UserRole.ADMIN, UserRole.HOTEL_MODERATOR)
 */
export const Roles = (...roles: [UserRole, ...UserRole[]]) => SetMetadata(ROLES_KEY, roles);
