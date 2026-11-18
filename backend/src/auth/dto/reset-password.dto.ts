import { IsNotEmpty, IsString } from 'class-validator';
import { IsStrongPassword } from './password.rules.js';

// ACC-07
export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsStrongPassword()
  newPassword: string;
}
