import { ApiProperty, ApiPropertyOptional, PartialType } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import { TrimString, UpperCode } from './transforms.js';

// ITN-10: name, description, optional time and optional cost
export class CreateActivityDto {
  @ApiProperty({ maxLength: 100, example: 'Pyramids of Giza tour' })
  @TrimString()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({ maxLength: 1000 })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({ example: '09:30', description: 'Local time of day, HH:mm (24h).' })
  @IsOptional()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'time must be HH:mm' })
  time?: string;

  @ApiPropertyOptional({ example: 25.5, minimum: 0, description: 'Counted under Activities in the budget (ITN-14).' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  cost?: number;

  @ApiPropertyOptional({ example: 'USD', description: 'Required when cost is given.' })
  @IsOptional()
  @UpperCode()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter currency code' })
  currency?: string;
}

// ITN-10
export class UpdateActivityDto extends PartialType(CreateActivityDto) {}
