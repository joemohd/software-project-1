import { HttpStatus } from '@nestjs/common';
import { Types } from 'mongoose';
import { UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import {
  accessTokenPayload,
  buildFrontendLink,
  clearedLoginAttempts,
  duplicateKeyMessage,
  failedLoginUpdate,
  generateToken,
  hashPassword,
  hashToken,
  isBlocked,
  isDuplicateKeyError,
  isExpired,
  LOCKOUT_MS,
  lockedException,
  lockoutRemainingMs,
  MESSAGES,
  normalizeEmail,
  passwordMatches,
  toProfile,
} from './auth.helper.js';
import type { UserRecord } from './auth.types.js';

const NOW = Date.UTC(2026, 0, 1, 12, 0, 0);

describe('auth.helper', () => {
  describe('tokens', () => {
    it('generates a different 64-char hex token each time', () => {
      const a = generateToken();
      expect(a).toMatch(/^[a-f0-9]{64}$/);
      expect(generateToken()).not.toBe(a);
    });

    it('hashes tokens deterministically, and never returns the token itself', () => {
      expect(hashToken('abc')).toBe(hashToken('abc'));
      expect(hashToken('abc')).not.toBe('abc');
      expect(hashToken('abc')).toMatch(/^[a-f0-9]{64}$/);
    });

    it('builds an access-token payload with a string user id', () => {
      const id = new Types.ObjectId();
      expect(accessTokenPayload(id, UserRole.ADMIN)).toEqual({ sub: id.toString(), role: UserRole.ADMIN, type: 'access' });
    });

    it('URL-encodes the token in email links', () => {
      expect(buildFrontendLink('http://app', 'reset-password', 'a b')).toBe('http://app/reset-password?token=a%20b');
    });
  });

  describe('passwords', () => {
    it('hashes and verifies a password', async () => {
      const hash = await hashPassword('Secret123');
      expect(hash).not.toBe('Secret123');
      expect(await passwordMatches('Secret123', hash)).toBe(true);
      expect(await passwordMatches('Wrong1234', hash)).toBe(false);
    });
  });

  it('normalizes emails', () => {
    expect(normalizeEmail('  Test@Example.COM ')).toBe('test@example.com');
  });

  it('treats a date at or before now as expired', () => {
    expect(isExpired(new Date(NOW), NOW)).toBe(true);
    expect(isExpired(new Date(NOW + 1), NOW)).toBe(false);
  });

  it('builds a profile without the password hash', () => {
    const id = new Types.ObjectId();
    const user = {
      _id: id,
      fullName: 'A',
      emailAddress: 'a@b.co',
      username: 'a',
      role: UserRole.USER,
      isVerified: false,
      passwordHash: 'secret',
    } as unknown as UserRecord;

    expect(toProfile(user)).toEqual({
      id: id.toString(),
      fullName: 'A',
      emailAddress: 'a@b.co',
      username: 'a',
      role: UserRole.USER,
      isVerified: false,
    });
  });

  it.each([
    [UserActivityStatus.ACTIVE, false],
    [UserActivityStatus.NEW, false],
    [UserActivityStatus.SUSPENDED, true],
    [UserActivityStatus.INACTIVE, true],
  ])('isBlocked(%s) is %s', (status, blocked) => {
    expect(isBlocked(status)).toBe(blocked);
  });

  it('recognizes duplicate-key errors and names the field', () => {
    expect(isDuplicateKeyError({ code: 11000 })).toBe(true);
    expect(isDuplicateKeyError(new Error('x'))).toBe(false);
    expect(duplicateKeyMessage({ keyPattern: { username: 1 } })).toBe(MESSAGES.usernameTaken);
    expect(duplicateKeyMessage({ keyPattern: { emailAddress: 1 } })).toBe(MESSAGES.emailTaken);
  });

  describe('login lockout (ACC-05)', () => {
    it('is not locked without a lockout date, or after it has passed', () => {
      expect(lockoutRemainingMs({ loginAttempts: 3, loginAttemptsResetAt: null }, NOW)).toBe(0);
      expect(lockoutRemainingMs({ loginAttempts: 5, loginAttemptsResetAt: new Date(NOW - 1) }, NOW)).toBe(0);
    });

    it('reports the time left on an active lockout', () => {
      expect(lockoutRemainingMs({ loginAttempts: 5, loginAttemptsResetAt: new Date(NOW + 60_000) }, NOW)).toBe(60_000);
    });

    it('counts a failure without locking before the 5th', () => {
      expect(failedLoginUpdate({ loginAttempts: 3, loginAttemptsResetAt: null }, NOW)).toEqual({
        loginAttempts: 4,
        loginAttemptsResetAt: null,
      });
    });

    it('locks for 15 minutes on the 5th consecutive failure', () => {
      expect(failedLoginUpdate({ loginAttempts: 4, loginAttemptsResetAt: null }, NOW)).toEqual({
        loginAttempts: 5,
        loginAttemptsResetAt: new Date(NOW + LOCKOUT_MS),
      });
    });

    it('starts a fresh count after an expired lockout', () => {
      expect(failedLoginUpdate({ loginAttempts: 5, loginAttemptsResetAt: new Date(NOW - 1) }, NOW)).toEqual({
        loginAttempts: 1,
        loginAttemptsResetAt: null,
      });
    });

    it('clears the counter', () => {
      expect(clearedLoginAttempts()).toEqual({ loginAttempts: 0, loginAttemptsResetAt: null });
    });

    it('builds a 423 with the minutes left, rounded up', () => {
      const error = lockedException(61_000);
      expect(error.getStatus()).toBe(HttpStatus.LOCKED);
      expect(error.message).toBe('Too many failed login attempts. Try again in 2 minutes.');
      expect(lockedException(60_000).message).toBe('Too many failed login attempts. Try again in 1 minute.');
    });
  });
});
