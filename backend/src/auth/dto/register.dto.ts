import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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
import { Trim } from './trim.transform.js';

// ACC-01
export class RegisterDto {
  @ApiProperty({ maxLength: 100 })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ maxLength: 254, description: 'Must not already be registered' })
  @Trim()
  @IsEmail()
  @MaxLength(254)
  emailAddress: string;

  @ApiProperty({
    minLength: 3,
    maxLength: 30,
    description: 'Letters, numbers, dots and underscores. Stored in lowercase; must be unique',
  })
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/, {
    message: 'username may only contain letters, numbers, dots and underscores',
  })
  username: string;

  @IsStrongPassword()
  password: string;

  @ApiProperty({ description: 'Mandatory terms-and-privacy consent checkbox; must be true' })
  @IsBoolean()
  @Equals(true, { message: 'you must accept the terms and privacy policy' })
  acceptedTerms: boolean;

  @ApiPropertyOptional({ description: 'E.164 format' })
  @Trim()
  @IsOptional()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phoneNumber must be in E.164 format (e.g. +201234567890)' })
  phoneNumber?: string;

  @ApiProperty({ description: 'Id of an existing country' })
  @IsMongoId()
  countryOfOriginId: string;
}
