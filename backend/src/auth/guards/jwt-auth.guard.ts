import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { User, UserActivityStatus, UserRole } from '../../database/schemas/user.schema.js';
import { ACCESS_TOKEN_COOKIE, blockedStatusMessage, isBlocked } from '../auth.helper.js';
import type { AuthenticatedRequest, JwtPayload } from '../auth.types.js';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator.js';

type UserAuthFields = { _id: Types.ObjectId; role: UserRole; status: UserActivityStatus; isVerified: boolean };

/**
 * Authenticates every request using the httpOnly access-token cookie (ACC-19), unless the route is marked @Public().
 *
 * The user is re-loaded from the database on each request so that role changes,
 * suspensions and deactivations take effect immediately instead of when the token expires.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwtService: JwtService,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.extractToken(request);
    if (!token) throw new UnauthorizedException('Missing access token.');

    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired access token.');
    }

    // Rejects other tokens signed with the same secret (e.g. email-verification tokens)
    if (payload?.type !== 'access' || !isValidObjectId(payload.sub)) {
      throw new UnauthorizedException('Invalid access token.');
    }

    const user = await this.userModel
      .findById(payload.sub)
      .select('role status isVerified')
      .lean<UserAuthFields>()
      .exec();

    if (!user) throw new UnauthorizedException('Account no longer exists.');
    if (isBlocked(user.status)) throw new ForbiddenException(blockedStatusMessage(user.status));

    request.user = {
      id: user._id.toString(),
      role: user.role,
      status: user.status,
      isVerified: user.isVerified,
    };
    return true;
  }

  private extractToken(request: AuthenticatedRequest): string | undefined {
    const cookies = request.cookies as Record<string, unknown> | undefined;
    const token = cookies?.[ACCESS_TOKEN_COOKIE];
    return typeof token === 'string' && token ? token : undefined;
  }
}
