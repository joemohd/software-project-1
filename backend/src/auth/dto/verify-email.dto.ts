import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

// ACC-02: query string of GET /api/auth/verify-email?token=...
export class VerifyEmailQueryDto {
  @ApiProperty({ description: 'The token from the verification email link' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
