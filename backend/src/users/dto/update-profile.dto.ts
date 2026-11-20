import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsNotEmpty, IsString, Matches, MaxLength, ValidateIf } from 'class-validator';
import { Trim } from '../../auth/dto/trim.transform.js';

// ACC-09
export class UpdateProfileDto {
  @ApiPropertyOptional({ maxLength: 100 })
  @Trim()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName?: string;

  @ApiPropertyOptional({ description: 'Phone number in E.164 format', example: '+201234567890' })
  @Trim()
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phoneNumber must be in E.164 format' })
  phoneNumber?: string;

  @ApiPropertyOptional({ description: 'An existing ISO 4217 currency code', example: 'USD' })
  @Transform(({ value }) => typeof value === 'string' ? value.trim().toUpperCase() : value)
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @Matches(/^[A-Z]{3}$/)
  preferredCurrency?: string;
}
