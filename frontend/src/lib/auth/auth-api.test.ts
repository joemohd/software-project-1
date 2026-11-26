import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { API_URL, ApiError, NETWORK_ERROR_STATUS } from '@/lib/api/client';
import { getCurrentUser, login, register } from './auth-api';
import { describeLoginError, describeRegisterError } from './errors';

const user = {
  id: '65a1f0c2e4b0a1b2c3d4e5f6',
  fullName: 'Mona Ahmed',
  emailAddress: 'mona@example.com',
  username: 'mona.ahmed',
  role: 'user',
  isVerified: false,
};

const reply = (status: number, body?: unknown): Response =>
  new Response(body === undefined ? '' : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('apiRequest via the auth calls', () => {
  it('posts JSON with credentials so the httpOnly cookies are sent and stored (ACC-19)', async () => {
    fetchMock.mockResolvedValue(reply(200, { user }));

    const result = await login({ emailAddress: 'mona@example.com', password: 'Travel2026' });

    expect(result.user).toEqual(user);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${API_URL}/auth/login`);
    expect(init.method).toBe('POST');
    expect(init.credentials).toBe('include');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(JSON.parse(init.body as string)).toEqual({ emailAddress: 'mona@example.com', password: 'Travel2026' });
  });

  it('turns a NestJS validation error (message list) into an ApiError', async () => {
    fetchMock.mockResolvedValue(reply(400, { statusCode: 400, message: ['a', 'b'], error: 'Bad Request' }));

    const error = await register({} as never).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(400);
    expect((error as ApiError).messages).toEqual(['a', 'b']);
  });

  it('reports an unreachable server as a network error', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));

    const error = (await login({ emailAddress: 'a@b.co', password: 'x' }).catch((caught: unknown) => caught)) as ApiError;

    expect(error.status).toBe(NETWORK_ERROR_STATUS);
    expect(error.message).toMatch(/reach the server/);
  });
});

describe('getCurrentUser (ACC-06, ACC-19)', () => {
  it('returns the user from /auth/me', async () => {
    fetchMock.mockResolvedValue(reply(200, user));
    await expect(getCurrentUser()).resolves.toEqual(user);
  });

  it('refreshes once when the access token has expired', async () => {
    fetchMock.mockResolvedValueOnce(reply(401, { message: 'Unauthorized' })).mockResolvedValueOnce(reply(200, { user }));

    await expect(getCurrentUser()).resolves.toEqual(user);
    expect(fetchMock.mock.calls[1][0]).toBe(`${API_URL}/auth/refresh`);
  });

  it('returns null when the session is gone', async () => {
    fetchMock
      .mockResolvedValueOnce(reply(401, { message: 'Unauthorized' }))
      .mockResolvedValueOnce(reply(401, { message: 'Your session has expired. Please log in again.' }));

    await expect(getCurrentUser()).resolves.toBeNull();
  });
});

describe('describeLoginError', () => {
  it('asks for a new password when the account must change its temporary one', () => {
    const failure = describeLoginError(
      new ApiError(403, ['You must set a new password before logging in. Provide newPassword.'], { mustChangePassword: true }),
    );
    expect(failure).toMatchObject({ tone: 'info', mustChangePassword: true });
  });

  it('shows the lockout as a warning (ACC-05)', () => {
    const failure = describeLoginError(new ApiError(423, ['Too many failed login attempts. Try again in 15 minutes.']));
    expect(failure).toEqual({
      tone: 'warning',
      messages: ['Too many failed login attempts. Try again in 15 minutes.'],
      mustChangePassword: false,
    });
  });

  it('passes the generic invalid-credentials message through', () => {
    expect(describeLoginError(new ApiError(401, ['Invalid email or password.'])).messages).toEqual(['Invalid email or password.']);
  });
});

describe('describeRegisterError', () => {
  it('pins duplicate email / username and unknown country to their fields', () => {
    expect(describeRegisterError(new ApiError(409, ['This email is already registered.'])).fieldErrors).toEqual({
      emailAddress: 'This email is already registered.',
    });
    expect(describeRegisterError(new ApiError(409, ['This username is already taken.'])).fieldErrors).toEqual({
      username: 'This username is already taken.',
    });
    expect(
      describeRegisterError(new ApiError(400, ['countryOfOriginId does not match a known country.'])).fieldErrors,
    ).toHaveProperty('countryOfOriginId');
  });

  it('keeps other messages for the form-level alert', () => {
    expect(describeRegisterError(new ApiError(400, ['phoneNumber must be in E.164 format']))).toEqual({
      messages: ['phoneNumber must be in E.164 format'],
      fieldErrors: {},
    });
  });
});
