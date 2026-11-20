import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, MaxLength } from 'class-validator';
import { Trim } from './trim.transform.js';

// ACC-07
export class ForgotPasswordDto {
  @ApiProperty()
  @Trim()
  @IsEmail()
  @MaxLength(254)
  emailAddress: string;
}
