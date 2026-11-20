import { HttpException, HttpStatus } from '@nestjs/common';
import bcrypt from 'bcrypt';
import type { CookieOptions, Response } from 'express';
import { createHash, randomBytes } from 'node:crypto';
import type { Types } from 'mongoose';
import { UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import type {
  EmailVerificationPayload,
  IssuedTokens,
  JwtPayload,
  LoginAttemptsUpdate,
  MailMessage,
  UserRecord,
} from './auth.types.js';
import type { UserProfileDto } from './dto/auth-response.dto.js';

/* ------------------------------------------------------------------ */
/* Constants                                                          */
/* ------------------------------------------------------------------ */

export const BCRYPT_ROUNDS = 12;
export const MAX_LOGIN_ATTEMPTS = 5; // ACC-05
export const LOCKOUT_MS = 15 * 60_000; // ACC-05: 15 minutes
export const PASSWORD_RESET_TTL_MS = 30 * 60_000; // ACC-07: 30 minutes
export const EMAIL_VERIFICATION_TTL_SECONDS = 24 * 60 * 60; // ACC-02: 24 hours

export const ACCESS_TOKEN_COOKIE = 'access_token';
export const REFRESH_TOKEN_COOKIE = 'refresh_token';
const REFRESH_TOKEN_PATH = '/api/auth'; // the refresh cookie is only sent to the auth endpoints

export const MESSAGES = {
  invalidCredentials: 'Invalid email or password.', // ACC-04: generic on purpose
  sessionExpired: 'Your session has expired. Please log in again.',
  emailTaken: 'This email is already registered.',
  usernameTaken: 'This username is already taken.',
  unknownCountry: 'countryOfOriginId does not match a known country.',
  invalidVerificationLink: 'This verification link is invalid or has expired.',
  emailVerified: 'Your email address has been verified.',
  loggedOut: 'You have been logged out.',
  forgotPassword: 'If an account with that email exists, a password reset link has been sent.',
  invalidResetLink: 'This password reset link is invalid or has expired.',
  passwordReset: 'Your password has been reset. Please log in with your new password.',
  wrongCurrentPassword: 'Current password is incorrect.',
  samePassword: 'New password must be different from the current password.',
  passwordChangeRequired: 'You must set a new password before logging in. Provide newPassword.',
  passwordChanged: 'Your password has been changed.',
  suspended: 'Your account has been suspended.',
  deactivated: 'This account has been deactivated.',
} as const;

/* ------------------------------------------------------------------ */
/* Tokens & passwords                                                 */
/* ------------------------------------------------------------------ */

/** Random, unguessable token (256 bits). Only its hash is ever stored. */
export const generateToken = (): string => randomBytes(32).toString('hex');

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, BCRYPT_ROUNDS);//12 rounds

export const passwordMatches = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

export const accessTokenPayload = (userId: Types.ObjectId | string, role: UserRole, sessionVersion = 0): JwtPayload => ({
  sub: String(userId),
  role,
  type: 'access',
  ...(sessionVersion > 0 && { sessionVersion }),
});

export const emailVerificationPayload = (userId: Types.ObjectId | string): EmailVerificationPayload => ({
  sub: String(userId),
  type: 'verify-email',
});

/** Link the user clicks in an email, e.g. http://localhost:3001/reset-password?token=... */
export const buildFrontendLink = (frontendUrl: string, path: string, token: string): string =>
  `${frontendUrl}/${path}?token=${encodeURIComponent(token)}`;

/* ------------------------------------------------------------------ */
/* Input normalisation & time                                         */
/* ------------------------------------------------------------------ */

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();// change the email to be lower case.

export const normalizeUsername = (username: string): string => username.trim().toLowerCase();// change the username to be lower case.

export const expiryDate = (durationMs: number, now = Date.now()): Date => new Date(now + durationMs);

export const isExpired = (date: Date | string, now = Date.now()): boolean => new Date(date).getTime() <= now;

/* ------------------------------------------------------------------ */
/* Users                                                              */
/* ------------------------------------------------------------------ */

/** Public view of an account; never includes the password hash. */
export const toProfile = (user: UserRecord): UserProfileDto => ({
  id: user._id.toString(),
  fullName: user.fullName,
  emailAddress: user.emailAddress,
  username: user.username,
  role: user.role,
  isVerified: user.isVerified,
});

/** Suspended (ACC-15, ACC-16) and deactivated (ACC-12) accounts can't log in or keep a session. */
export const isBlocked = (status: UserActivityStatus): boolean =>
  status === UserActivityStatus.SUSPENDED || status === UserActivityStatus.INACTIVE;

export const blockedStatusMessage = (status: UserActivityStatus): string =>
  status === UserActivityStatus.SUSPENDED ? MESSAGES.suspended : MESSAGES.deactivated;

/** MongoDB unique-index violation (e.g. two registrations racing for the same email). */
export const isDuplicateKeyError = (error: unknown): error is { code: 11000; keyPattern?: Record<string, unknown> } =>
  typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 11000;

export const duplicateKeyMessage = (error: { keyPattern?: Record<string, unknown> }): string =>
  error.keyPattern?.username ? MESSAGES.usernameTaken : MESSAGES.emailTaken;

/* ------------------------------------------------------------------ */
/* Login lockout (ACC-05)                                             */
/* loginAttemptsResetAt holds the end of the current lockout          */
/* ------------------------------------------------------------------ */

type LockoutFields = Pick<UserRecord, 'loginAttempts' | 'loginAttemptsResetAt'>;

/** Milliseconds left on the lockout, or 0 if the account isn't locked. */
export const lockoutRemainingMs = (user: LockoutFields, now = Date.now()): number =>
  user.loginAttemptsResetAt ? Math.max(0, new Date(user.loginAttemptsResetAt).getTime() - now) : 0;

/** Fields to save after a wrong password. The 5th consecutive failure starts a 15-minute lockout. */
export const failedLoginUpdate = (user: LockoutFields, now = Date.now()): LoginAttemptsUpdate => {
  const previousFailures = user.loginAttemptsResetAt ? 0 : (user.loginAttempts ?? 0); // an expired lockout starts a fresh count
  const loginAttempts = Math.min(previousFailures + 1, MAX_LOGIN_ATTEMPTS);
  const locked = loginAttempts >= MAX_LOGIN_ATTEMPTS;
  return { loginAttempts, loginAttemptsResetAt: locked ? expiryDate(LOCKOUT_MS, now) : null };
};

/** Fields to save after a successful login or a password reset. */
export const clearedLoginAttempts = (): LoginAttemptsUpdate => ({ loginAttempts: 0, loginAttemptsResetAt: null });

export const lockedMessage = (remainingMs: number): string => {
  const minutes = Math.ceil(remainingMs / 60_000);
  return `Too many failed login attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`;
};

export const lockedException = (remainingMs: number): HttpException =>
  new HttpException(lockedMessage(remainingMs), HttpStatus.LOCKED);

/* ------------------------------------------------------------------ */
/* Cookies (ACC-19)                                                   */
/* ------------------------------------------------------------------ */

const cookieOptions = (secure: boolean, path: string): CookieOptions => ({
  httpOnly: true, // not readable from JavaScript
  secure,
  sameSite: 'lax',
  path,
});

/** Writes both auth cookies. Returns the response for chaining. */
export const setAuthCookies = (res: Response, tokens: IssuedTokens, secure: boolean): Response =>
  res
    .cookie(ACCESS_TOKEN_COOKIE, tokens.accessToken, {
      ...cookieOptions(secure, '/'),
      maxAge: tokens.accessTokenMaxAgeSeconds * 1000,
    })
    .cookie(REFRESH_TOKEN_COOKIE, tokens.refreshToken, {
      ...cookieOptions(secure, REFRESH_TOKEN_PATH),
      maxAge: tokens.refreshTokenMaxAgeSeconds * 1000,
    });

/** Removes both auth cookies (ACC-06). Returns the response for chaining. */
export const clearAuthCookies = (res: Response, secure: boolean): Response =>
  res
    .clearCookie(ACCESS_TOKEN_COOKIE, cookieOptions(secure, '/'))
    .clearCookie(REFRESH_TOKEN_COOKIE, cookieOptions(secure, REFRESH_TOKEN_PATH));

/* ------------------------------------------------------------------ */
/* Emails (GEN-01-B)                                                  */
/* ------------------------------------------------------------------ */

/** Makes user-provided text (e.g. a name) safe to put inside HTML. */
export const escapeHtml = (text: string): string =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const emailLayout = (greeting: string, paragraph: string, buttonText: string, link: string, footnote: string): string => `
  <div style="font-family: Arial, sans-serif; max-width: 520px; margin: auto; color: #222">
    <p>${greeting}</p>
    <p>${paragraph}</p>
    <p><a href="${link}" style="display: inline-block; padding: 10px 18px; background: #1a73e8; color: #fff; text-decoration: none; border-radius: 4px">${buttonText}</a></p>
    <p style="font-size: 13px; color: #555">Or open this link: <br><a href="${link}">${link}</a></p>
    <p style="font-size: 13px; color: #555">${footnote}</p>
  </div>`;

/** ACC-02: sent after registration. */
export const verificationEmail = (to: string, fullName: string, link: string): MailMessage => ({
  to,
  subject: 'Verify your email address',
  text: `Hi ${fullName},\n\nPlease verify your email address by opening this link:\n${link}\n\nThe link expires in 24 hours. You need a verified email to make bookings.`,
  html: emailLayout(
    `Hi ${escapeHtml(fullName)},`,
    'Thanks for registering. Please verify your email address. You need a verified email to make bookings.',
    'Verify email',
    link,
    'The link expires in 24 hours. If you did not create an account, you can ignore this email.',
  ),
});

/** ACC-07: sent by forgot-password. */
export const passwordResetEmail = (to: string, fullName: string, link: string): MailMessage => ({
  to,
  subject: 'Reset your password',
  text: `Hi ${fullName},\n\nTo reset your password, open this link:\n${link}\n\nThe link expires in 30 minutes and can be used once. If you did not ask for this, ignore this email.`,
  html: emailLayout(
    `Hi ${escapeHtml(fullName)},`,
    'We received a request to reset your password.',
    'Reset password',
    link,
    'The link expires in 30 minutes and can be used once. If you did not ask for this, you can ignore this email; your password will not change.',
  ),
});
