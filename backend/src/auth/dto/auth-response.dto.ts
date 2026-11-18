import { UserRole } from '../../database/schemas/user.schema.js';

/** Public view of an account returned to clients (never includes the password hash). */
export interface UserProfileDto {
  id: string;
  fullName: string;
  emailAddress: string;
  username: string;
  role: UserRole;
  isVerified: boolean;
}

export interface RegisterResponseDto {
  user: UserProfileDto;
}

/** Tokens are NOT in the body; they are set as httpOnly cookies (ACC-19). */
export interface LoginResponseDto {
  user: UserProfileDto;
}

/** Generic acknowledgement for endpoints that don't return data (logout, password flows, email verification). */
export interface MessageResponseDto {
  message: string;
}
