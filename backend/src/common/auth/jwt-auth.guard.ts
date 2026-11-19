import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from './public.decorator.js';
import type { JwtUser } from './jwt-user.interface.js';

/**
 * Authentication guard.
 *
 * SHARED FILE — coordinate with the Auth (ACC) teammate. If they already ship a
 * JwtAuthGuard, delete this one and use theirs. This implementation reads the
 * token from the `access_token` httpOnly cookie (per the spec: tokens must NOT
 * live in localStorage/sessionStorage) and falls back to an `Authorization:
 * Bearer <token>` header so the endpoints are easy to demo in Swagger UI.
 *
 * Routes marked with `@Public()` bypass this guard entirely.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (!token) {
      throw new UnauthorizedException('Authentication required');
    }

    try {
      const payload = await this.jwtService.verifyAsync<JwtUser>(token);
      (request as Request & { user?: JwtUser }).user = payload;
      return true;
    } catch {
      throw new UnauthorizedException('Invalid or expired session');
    }
  }

  private extractToken(request: Request): string | undefined {
    const cookies = (request as Request & { cookies?: Record<string, string> })
      .cookies;
    const fromCookie = cookies?.['access_token'];
    if (fromCookie) return fromCookie;

    const auth = request.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);
    return undefined;
  }
}
