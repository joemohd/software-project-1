import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from './password.rules.js';
import { Trim } from './trim.transform.js';

// ACC-04, ACC-07a, ACC-13
export class LoginDto {
  @ApiProperty()
  @Trim()
  @IsEmail()
  @MaxLength(254)
  emailAddress: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password: string;

  @IsOptional()
  @IsStrongPassword()
  @ApiPropertyOptional({ description: 'Required when the account must replace its temporary password' })
  newPassword?: string;
}
