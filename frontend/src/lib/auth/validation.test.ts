import { describe, expect, it } from 'vitest';
import type { RegisterPayload } from '@/types/auth';
import { passwordRules, safeRedirectPath, toRegisterPayload, validateLogin, validateRegister } from './validation';

const validRegister: RegisterPayload = {
  fullName: 'Mona Ahmed',
  emailAddress: 'mona@example.com',
  username: 'mona.ahmed',
  password: 'Travel2026',
  acceptedTerms: true,
  countryOfOriginId: '65a1f0c2e4b0a1b2c3d4e5f6',
  phoneNumber: '',
};

describe('passwordRules (ACC-01)', () => {
  it('passes only with 8+ characters, a letter and a digit', () => {
    expect(passwordRules('Travel2026').every((rule) => rule.ok)).toBe(true);
    expect(passwordRules('short1').map((rule) => rule.ok)).toEqual([false, true, true]);
    expect(passwordRules('12345678').map((rule) => rule.ok)).toEqual([true, false, true]);
    expect(passwordRules('abcdefgh').map((rule) => rule.ok)).toEqual([true, true, false]);
  });
});

describe('validateLogin (ACC-04)', () => {
  it('accepts a valid email and password', () => {
    expect(validateLogin({ emailAddress: ' user@example.com ', password: 'anything' })).toEqual({});
  });

  it('flags a missing password and a malformed email', () => {
    expect(validateLogin({ emailAddress: 'not-an-email', password: '' })).toEqual({
      emailAddress: 'Enter a valid email address.',
      password: 'Enter your password.',
    });
  });

  it('requires a strong, different new password when replacing a temporary one', () => {
    expect(validateLogin({ emailAddress: 'a@b.co', password: 'Temp1234', newPassword: 'weak' }, true).newPassword).toBeDefined();
    expect(validateLogin({ emailAddress: 'a@b.co', password: 'Temp1234', newPassword: 'Temp1234' }, true).newPassword).toMatch(
      /different/,
    );
    expect(validateLogin({ emailAddress: 'a@b.co', password: 'Temp1234', newPassword: 'Fresh2026' }, true)).toEqual({});
  });
});

describe('validateRegister (ACC-01)', () => {
  it('accepts a complete form', () => {
    expect(validateRegister(validRegister)).toEqual({});
  });

  it('flags every invalid field', () => {
    const errors = validateRegister({
      fullName: '  ',
      emailAddress: 'bad',
      username: 'no spaces!',
      password: 'abc',
      acceptedTerms: false,
      countryOfOriginId: '',
      phoneNumber: '0123',
    });
    expect(Object.keys(errors).sort()).toEqual(
      ['acceptedTerms', 'countryOfOriginId', 'emailAddress', 'fullName', 'password', 'phoneNumber', 'username'].sort(),
    );
  });

  it('rejects usernames outside 3–30 characters', () => {
    expect(validateRegister({ ...validRegister, username: 'ab' }).username).toBeDefined();
    expect(validateRegister({ ...validRegister, username: 'a'.repeat(31) }).username).toBeDefined();
  });
});

describe('toRegisterPayload', () => {
  it('trims text and drops an empty phone number', () => {
    const payload = toRegisterPayload({ ...validRegister, fullName: ' Mona Ahmed ', phoneNumber: '  ' });
    expect(payload.fullName).toBe('Mona Ahmed');
    expect(payload).not.toHaveProperty('phoneNumber');
  });

  it('keeps a phone number when given', () => {
    expect(toRegisterPayload({ ...validRegister, phoneNumber: ' +201234567890 ' }).phoneNumber).toBe('+201234567890');
  });
});

describe('safeRedirectPath', () => {
  it('allows same-site paths only', () => {
    expect(safeRedirectPath('/bookings')).toBe('/bookings');
    expect(safeRedirectPath(undefined)).toBe('/');
    expect(safeRedirectPath('https://evil.example')).toBe('/');
    expect(safeRedirectPath('//evil.example')).toBe('/');
    expect(safeRedirectPath('/\\evil.example')).toBe('/');
  });
});
