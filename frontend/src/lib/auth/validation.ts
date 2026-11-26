// Client-side checks that mirror backend/src/auth/dto (login.dto.ts, register.dto.ts, password.rules.ts).
// They give instant feedback only; the backend validates every request again.

import type { LoginPayload, RegisterPayload } from '@/types/auth';

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72; // bcrypt only uses the first 72 bytes
export const EMAIL_MAX = 254;
export const FULL_NAME_MAX = 100;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 30;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const USERNAME_PATTERN = /^[a-zA-Z0-9._]+$/;
const PHONE_PATTERN = /^\+[1-9]\d{1,14}$/; // E.164

export interface PasswordRule {
  label: string;
  ok: boolean;
}

export type FieldErrors<K extends string> = Partial<Record<K, string>>;

export type LoginField = 'emailAddress' | 'password' | 'newPassword';
export type RegisterField =
  | 'fullName'
  | 'emailAddress'
  | 'username'
  | 'password'
  | 'countryOfOriginId'
  | 'phoneNumber'
  | 'acceptedTerms';

/** ACC-01 password rules, as shown under the password field. */
export const passwordRules = (password: string): PasswordRule[] => [
  { label: `At least ${PASSWORD_MIN} characters`, ok: password.length >= PASSWORD_MIN },
  { label: 'At least one letter', ok: /[A-Za-z]/.test(password) },
  { label: 'At least one digit', ok: /\d/.test(password) },
];

/** Error for a new password, or undefined when it meets every rule. */
export const newPasswordError = (password: string): string | undefined => {
  if (password.length > PASSWORD_MAX) return `Password must be at most ${PASSWORD_MAX} characters.`;
  const failed = passwordRules(password).find((rule) => !rule.ok);
  return failed ? `Password needs: ${failed.label.toLowerCase()}.` : undefined;
};

const emailError = (email: string): string | undefined => {
  const value = email.trim();
  if (!value) return 'Enter your email address.';
  if (value.length > EMAIL_MAX || !EMAIL_PATTERN.test(value)) return 'Enter a valid email address.';
  return undefined;
};

/** Returns only the fields that have a problem; an empty object means the form can be sent. */
export const validateLogin = (values: LoginPayload, needsNewPassword = false): FieldErrors<LoginField> => {
  const errors: FieldErrors<LoginField> = {};
  const email = emailError(values.emailAddress);
  if (email) errors.emailAddress = email;
  if (!values.password) errors.password = 'Enter your password.';
  else if (values.password.length > PASSWORD_MAX) errors.password = `Password must be at most ${PASSWORD_MAX} characters.`;
  if (needsNewPassword) {
    const newPassword = newPasswordError(values.newPassword ?? '');
    if (newPassword) errors.newPassword = newPassword;
    else if (values.newPassword === values.password) errors.newPassword = 'New password must be different from the current one.';
  }
  return errors;
};

/** Returns only the fields that have a problem; an empty object means the form can be sent. */
export const validateRegister = (values: RegisterPayload): FieldErrors<RegisterField> => {
  const errors: FieldErrors<RegisterField> = {};

  const fullName = values.fullName.trim();
  if (!fullName) errors.fullName = 'Enter your full name.';
  else if (fullName.length > FULL_NAME_MAX) errors.fullName = `Full name must be at most ${FULL_NAME_MAX} characters.`;

  const email = emailError(values.emailAddress);
  if (email) errors.emailAddress = email;

  const username = values.username.trim();
  if (username.length < USERNAME_MIN || username.length > USERNAME_MAX) {
    errors.username = `Username must be ${USERNAME_MIN}–${USERNAME_MAX} characters.`;
  } else if (!USERNAME_PATTERN.test(username)) {
    errors.username = 'Use only letters, numbers, dots and underscores.';
  }

  const password = newPasswordError(values.password);
  if (password) errors.password = password;

  if (!values.countryOfOriginId) errors.countryOfOriginId = 'Choose your country of origin.';

  const phone = values.phoneNumber?.trim();
  if (phone && !PHONE_PATTERN.test(phone)) errors.phoneNumber = 'Use international format, e.g. +201234567890.';

  if (!values.acceptedTerms) errors.acceptedTerms = 'You must accept the terms and privacy policy.';

  return errors;
};

/** Trims text fields and drops an empty phone number, so the body passes the backend's whitelist. */
export const toRegisterPayload = (values: RegisterPayload): RegisterPayload => {
  const phoneNumber = values.phoneNumber?.trim();
  return {
    fullName: values.fullName.trim(),
    emailAddress: values.emailAddress.trim(),
    username: values.username.trim(),
    password: values.password,
    acceptedTerms: values.acceptedTerms,
    countryOfOriginId: values.countryOfOriginId,
    ...(phoneNumber ? { phoneNumber } : {}),
  };
};

/** Where to go after logging in: only same-site paths, so `?next=` can't send users to another site. */
export const safeRedirectPath = (next: string | undefined | null, fallback = '/'): string => {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return fallback;
  return next;
};
