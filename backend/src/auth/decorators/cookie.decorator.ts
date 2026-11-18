import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/**
 * Injects a single cookie value (requires cookie-parser in main.ts).
 *
 * @example refresh(@Cookie(REFRESH_TOKEN_COOKIE) refreshToken: string | undefined)
 */
export const Cookie = createParamDecorator((name: string, context: ExecutionContext): string | undefined => {
  const cookies = context.switchToHttp().getRequest<Request>().cookies as Record<string, unknown> | undefined;
  const value = cookies?.[name];
  return typeof value === 'string' ? value : undefined;
});
