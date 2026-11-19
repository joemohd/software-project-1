import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import type { JwtUser } from './jwt-user.interface.js';

/**
 * Optional authentication: never rejects the request. If a valid token is
 * present it attaches `req.user`; otherwise the request proceeds as a Guest.
 *
 * Used on endpoints that both Guests and Registered Users may call
 * (hotel search HTL-11/12, available rooms HTL-15, hotel reviews HTL-24).
 */
@Injectable()
export class OptionalJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(request);
    if (token) {
      try {
        const payload = await this.jwtService.verifyAsync<JwtUser>(token);
        (request as Request & { user?: JwtUser }).user = payload;
      } catch {
        /* ignore — treat as an anonymous Guest */
      }
    }
    return true;
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
