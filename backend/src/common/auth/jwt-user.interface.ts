import { Role } from '../enums/role.enum.js';

/**
 * Shape of the decoded JWT payload attached to `req.user`.
 *
 * SHARED CONTRACT — this must match the payload signed by the login endpoint
 * (ACC-04). Agree these claim names with the Auth teammate:
 *   - sub      : the user's Mongo _id (string)
 *   - email    : the user's email
 *   - role     : one of the Role enum values
 *   - hotelId  : (hotel moderators only) the _id of the hotel they manage
 */
export interface JwtUser {
  sub: string;
  email: string;
  role: Role;
  hotelId?: string;
  airlineId?: string;
}
