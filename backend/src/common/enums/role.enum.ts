/**
 * Application roles.
 *
 * SHARED FILE — coordinate with the Auth (ACC) teammate.
 * The string values here MUST match exactly what the login endpoint puts in
 * the JWT `role` claim. If their enum already exists, delete this file and
 * import theirs instead.
 */
export enum Role {
  USER = 'user',
  ADMIN = 'admin',
  HOTEL_MODERATOR = 'hotel_moderator',
  AIRLINE_MODERATOR = 'airline_moderator',
}
