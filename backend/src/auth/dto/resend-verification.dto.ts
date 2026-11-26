import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
import { Trim } from './trim.transform.js';

// ACC-02: body of POST /api/auth/resend-verification
export class ResendVerificationDto {
  @ApiProperty()
  @Trim()
  @IsEmail()
  @MaxLength(254)
  emailAddress: string;
}
