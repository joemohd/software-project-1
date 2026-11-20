import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiForbiddenResponse, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { UserRole } from '../database/schemas/user.schema.js';
import { ACCESS_TOKEN_COOKIE } from '../auth/auth.helper.js';
import { Roles } from '../auth/decorators/roles.decorator.js';

/**
 * Itinerary owner routes: registered users only (ITN-01). The global JwtAuthGuard checks
 * the login cookie and RolesGuard the role; ownership is checked in the services (ACC-11).
 */
export const TravelerOnly = () =>
  applyDecorators(
    Roles(UserRole.USER),
    ApiCookieAuth(ACCESS_TOKEN_COOKIE),
    ApiUnauthorizedResponse({ description: 'Not logged in.' }),
    ApiForbiddenResponse({ description: 'Only registered users (travelers) manage itineraries.' }),
  );
