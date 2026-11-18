import {
  Equals,
  IsBoolean,
  IsEmail,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from './password.rules.js';

// ACC-01
export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @IsEmail()
  @MaxLength(254)
  emailAddress: string;

  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/, {
    message: 'username may only contain letters, numbers, dots and underscores',
  })
  username: string;

  @IsStrongPassword()
  password: string;

  // Mandatory terms-and-privacy consent checkbox
  @IsBoolean()
  @Equals(true, { message: 'you must accept the terms and privacy policy' })
  acceptedTerms: boolean;

  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phoneNumber must be in E.164 format (e.g. +201234567890)' })
  phoneNumber?: string;

  @IsMongoId()
  countryOfOriginId: string;
}
