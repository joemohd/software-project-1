// Turns backend auth errors into what the login / register forms should show.

import { ApiError } from '@/lib/api/client';
import type { FieldErrors, RegisterField } from './validation';

export type MessageTone = 'error' | 'warning' | 'info';

export interface LoginFailure {
  tone: MessageTone;
  messages: string[];
  /** ACC-07a / ACC-13: the account has a temporary password and must set a new one to log in. */
  mustChangePassword: boolean;
}

export interface RegisterFailure {
  messages: string[];
  fieldErrors: FieldErrors<RegisterField>;
}

const GENERIC = 'Something went wrong. Please try again.';

/** Login outcomes from backend/src/auth/auth.service.ts login(). */
export const describeLoginError = (error: unknown): LoginFailure => {
  if (!(error instanceof ApiError)) return { tone: 'error', messages: [GENERIC], mustChangePassword: false };

  // 403 with mustChangePassword: show the "new password" field instead of an error
  if (error.status === 403 && error.body.mustChangePassword === true) {
    return {
      tone: 'info',
      messages: ['Your password was reset by an administrator. Choose a new password to finish logging in.'],
      mustChangePassword: true,
    };
  }
  // 423 Locked (ACC-05): the server says how many minutes are left
  if (error.status === 423) return { tone: 'warning', messages: error.messages, mustChangePassword: false };
  // 401 is deliberately generic (ACC-04); 403 is suspended / deactivated; 400 is validation
  return { tone: 'error', messages: error.messages, mustChangePassword: false };
};

/** Register outcomes from backend/src/auth/auth.service.ts register(); known messages are pinned to their field. */
export const describeRegisterError = (error: unknown): RegisterFailure => {
  if (!(error instanceof ApiError)) return { messages: [GENERIC], fieldErrors: {} };

  const fieldErrors: FieldErrors<RegisterField> = {};
  const messages: string[] = [];
  for (const message of error.messages) {
    const lower = message.toLowerCase();
    if (lower.includes('email is already registered')) fieldErrors.emailAddress = message;
    else if (lower.includes('username is already taken')) fieldErrors.username = message;
    else if (lower.includes('countryoforiginid')) fieldErrors.countryOfOriginId = 'Choose a country from the list.';
    else messages.push(message);
  }
  return { messages, fieldErrors };
};
