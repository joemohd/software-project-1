import { applyDecorators } from '@nestjs/common';
import { ApiCookieAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';

/**
 * Swagger only: marks a route as needing the login cookie.
 * The global JwtAuthGuard already protects every route that isn't @Public() (ACC-10).
 */
export const LoginRequired = () =>
  applyDecorators(
    ApiCookieAuth(),
    ApiUnauthorizedResponse({ description: 'Not logged in.' }),
  );
