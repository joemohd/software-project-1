import { applyDecorators } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

/**
 * Password rules from ACC-01: at least 8 characters, including at least one letter and one digit.
 * Max 72 because bcrypt only uses the first 72 bytes.
 * Used for every new password (register ACC-01, reset ACC-07, change ACC-08).
 */
export const IsStrongPassword = () =>
  applyDecorators(
    ApiProperty({
      description: 'At least 8 characters, including at least one letter and one digit',
      minLength: 8,
      maxLength: 72,
    }),
    IsString(),
    MinLength(8),
    MaxLength(72),
    Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
      message: 'password must contain at least one letter and one digit',
    }),
  );
