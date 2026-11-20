import { ApiProperty } from '@nestjs/swagger';
import { Equals, IsBoolean } from 'class-validator';

// ACC-12
export class DeactivateAccountDto {
  @ApiProperty({ description: 'Explicit confirmation of account deactivation; must be true', example: true })
  @IsBoolean()
  @Equals(true)
  confirm: boolean;
}
