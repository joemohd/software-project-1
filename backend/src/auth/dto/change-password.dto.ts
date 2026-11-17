import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { IsStrongPassword } from './password.rules.js';

// ACC-08
export class ChangePasswordDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  currentPassword: string;

  @IsStrongPassword()
  newPassword: string;
}
