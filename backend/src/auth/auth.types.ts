import type { Request } from 'express';
import type { Types } from 'mongoose';
import type { User, UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import type { UserProfileDto } from './dto/auth-response.dto.js';

/** A user document read with .lean() */
export type UserRecord = User & { _id: Types.ObjectId };

/** Login-lockout fields written after each login attempt (ACC-05). */
export interface LoginAttemptsUpdate {
  loginAttempts: number;
  loginAttemptsResetAt: Date | null;
}

/** Claims carried inside a signed access token. */
export interface JwtPayload {
  sub: string; // user id
  role: UserRole;
  type: 'access';
}

/** Claims carried inside an email-verification token (ACC-02). */
export interface EmailVerificationPayload {
  sub: string; // user id
  type: 'verify-email';
}

/** The user attached to the request by JwtAuthGuard (always freshly loaded from the database). */
export interface AuthenticatedUser {
  id: string;
  role: UserRole;
  status: UserActivityStatus;
  isVerified: boolean; // ACC-02: booking modules should reject unverified users
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };

/** Tokens issued on login / refresh; the controller writes them into httpOnly cookies (ACC-19). */
export interface IssuedTokens {
  accessToken: string;
  accessTokenMaxAgeSeconds: number;
  refreshToken: string;
  refreshTokenMaxAgeSeconds: number;
}

/** Result of a successful login or refresh. */
export interface AuthSession {
  user: UserProfileDto;
  tokens: IssuedTokens;
}
