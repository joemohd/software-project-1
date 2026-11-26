// Shapes returned and accepted by the backend's /api/auth endpoints (backend/src/auth/dto).

export type UserRole = 'user' | 'admin' | 'airline moderator' | 'hotel moderator';

/** GET /api/auth/me, and the `user` in login / register / refresh responses. */
export interface UserProfile {
  id: string;
  fullName: string;
  emailAddress: string;
  username: string;
  role: UserRole;
  isVerified: boolean;
}

/** POST /api/auth/login, POST /api/auth/refresh. Tokens are httpOnly cookies, never in the body. */
export interface LoginResponse {
  user: UserProfile;
}

/** POST /api/auth/register */
export interface RegisterResponse {
  user: UserProfile;
}

/** POST /api/auth/logout and other acknowledgements. */
export interface MessageResponse {
  message: string;
}

/** GET /api/auth/countries */
export interface CountryOption {
  id: string;
  code: string;
  name: string;
}

/** Body of POST /api/auth/login (ACC-04). `newPassword` replaces a temporary password (ACC-07a, ACC-13). */
export interface LoginPayload {
  emailAddress: string;
  password: string;
  newPassword?: string;
}

/** Body of POST /api/auth/register (ACC-01). */
export interface RegisterPayload {
  fullName: string;
  emailAddress: string;
  username: string;
  password: string;
  acceptedTerms: boolean;
  countryOfOriginId: string;
  phoneNumber?: string;
}
