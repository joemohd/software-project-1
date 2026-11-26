import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../../database/schemas/user.schema.js';

// Response bodies are classes (not interfaces) so Swagger can show them.

/** Public view of an account returned to clients (never includes the password hash). */
export class UserProfileDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  fullName: string;

  @ApiProperty()
  emailAddress: string;

  @ApiProperty()
  username: string;

  @ApiProperty({ enum: UserRole })
  role: UserRole;

  @ApiProperty({ description: 'ACC-02: bookings require a verified email' })
  isVerified: boolean;
}

export class RegisterResponseDto {
  @ApiProperty({ type: UserProfileDto })
  user: UserProfileDto;
}

/** Tokens are NOT in the body; they are set as httpOnly cookies (ACC-19). */
export class LoginResponseDto {
  @ApiProperty({ type: UserProfileDto })
  user: UserProfileDto;
}

/** One entry in the register form's country dropdown (ACC-01: countryOfOriginId). */
export class CountryOptionDto {
  @ApiProperty({ description: 'Send this as countryOfOriginId when registering' })
  id: string;

  @ApiProperty({ example: 'EG', description: 'ISO 3166-1 alpha-2 code' })
  code: string;

  @ApiProperty({ example: 'Egypt' })
  name: string;
}

/** Generic acknowledgement for endpoints that don't return data (logout, password flows, email verification). */
export class MessageResponseDto {
  @ApiProperty()
  message: string;
}
