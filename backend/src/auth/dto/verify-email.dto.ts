import { IsNotEmpty, IsString } from 'class-validator';

/** Query string of GET /api/auth/verify-email?token=... */
export class VerifyEmailQueryDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}
