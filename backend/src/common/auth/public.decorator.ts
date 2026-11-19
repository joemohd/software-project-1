import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route as publicly accessible (Guest allowed).
 * `JwtAuthGuard` skips token enforcement for routes carrying this metadata.
 * Use `OptionalJwtAuthGuard` instead when a route is public but still wants
 * to read the user if a token happens to be present.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
