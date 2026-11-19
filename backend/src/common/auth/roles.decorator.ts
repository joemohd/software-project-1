import { SetMetadata } from '@nestjs/common';
import { Role } from '../enums/role.enum.js';

export const ROLES_KEY = 'roles';

/**
 * Restricts a route to the given roles. Used together with `RolesGuard`.
 * Usage: `@Roles(Role.HOTEL_MODERATOR)`
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
