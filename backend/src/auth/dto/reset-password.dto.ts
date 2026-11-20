import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';
import { IsStrongPassword } from './password.rules.js';

// ACC-07
export class ResetPasswordDto {
  @ApiProperty({ description: 'The token from the password-reset email link' })
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsStrongPassword()
  newPassword: string;
}
