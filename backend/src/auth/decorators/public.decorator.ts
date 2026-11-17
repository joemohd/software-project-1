import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

/**
 * Marks a route (or a whole controller) as accessible to guests.
 * Every route is protected by default; use this to opt out.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
