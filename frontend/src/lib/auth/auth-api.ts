// Calls to the backend's /api/auth endpoints (backend/src/auth/auth.controller.ts).

import { ApiError, apiRequest } from '@/lib/api/client';
import type {
  CountryOption,
  LoginPayload,
  LoginResponse,
  MessageResponse,
  RegisterPayload,
  RegisterResponse,
  UserProfile,
} from '@/types/auth';

const json = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

/** ACC-04, ACC-05: sets the access/refresh cookies and returns the signed-in user. */
export const login = (payload: LoginPayload): Promise<LoginResponse> =>
  apiRequest<LoginResponse>('/auth/login', json(payload));

/** ACC-01: creates the account. The user still has to log in afterwards. */
export const register = (payload: RegisterPayload): Promise<RegisterResponse> =>
  apiRequest<RegisterResponse>('/auth/register', json(payload));

/** ACC-06: revokes the session and clears the cookies. */
export const logout = (): Promise<MessageResponse> => apiRequest<MessageResponse>('/auth/logout', { method: 'POST' });

/** ACC-06: swaps the refresh cookie for new tokens. */
export const refreshSession = (): Promise<LoginResponse> =>
  apiRequest<LoginResponse>('/auth/refresh', { method: 'POST' });

/** ACC-19: the signed-in user, read from the access-token cookie. */
export const me = (): Promise<UserProfile> => apiRequest<UserProfile>('/auth/me');

/** ACC-02: confirms the email address using the token from the emailed link. */
export const verifyEmail = (token: string): Promise<MessageResponse> =>
  apiRequest<MessageResponse>(`/auth/verify-email?token=${encodeURIComponent(token)}`);

/** ACC-02: emails a new verification link. The answer is the same whether or not the account exists. */
export const resendVerification = (emailAddress: string): Promise<MessageResponse> =>
  apiRequest<MessageResponse>('/auth/resend-verification', json({ emailAddress: emailAddress.trim() }));

/** ACC-01: countries for the register form's "Country of origin" field. */
export const getCountries = (): Promise<CountryOption[]> => apiRequest<CountryOption[]>('/auth/countries');

/**
 * The signed-in user, or null when nobody is logged in.
 * The access token lives 15 minutes, so a 401 is retried once through the refresh cookie.
 */
export const getCurrentUser = async (): Promise<UserProfile | null> => {
  try {
    return await me();
  } catch (error) {
    if (!(error instanceof ApiError) || error.status !== 401) throw error;
  }
  try {
    const { user } = await refreshSession();
    return user;
  } catch (error) {
    if (error instanceof ApiError && (error.status === 401 || error.status === 403)) return null;
    throw error;
  }
};
