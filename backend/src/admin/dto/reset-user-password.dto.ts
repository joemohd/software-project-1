import { IsStrongPassword } from '../../auth/dto/password.rules.js';

// ACC-07a
export class ResetUserPasswordDto {
  @IsStrongPassword()
  temporaryPassword: string;
}
