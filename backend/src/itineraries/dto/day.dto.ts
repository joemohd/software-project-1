import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsMongoId, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { TrimString } from './transforms.js';

// ITN-05, ITN-09: every day needs a city from the shared city list
export class CreateDayDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60718', description: 'Id of a seeded city (see GET /api/airports for city ids).' })
  @IsMongoId()
  cityId: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

// ITN-05
export class UpdateDayDto {
  @ApiPropertyOptional({ example: '6650f1c2a1b2c3d4e5f60718' })
  @IsOptional()
  @IsMongoId()
  cityId?: string;

  @ApiPropertyOptional({ maxLength: 2000 })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(2000)
  notes?: string;
}

// ITN-08: move one day to a new 1-based position
export class ReorderDaysDto {
  @ApiProperty({ example: '6650f1c2a1b2c3d4e5f60718' })
  @IsMongoId()
  dayId: string;

  @ApiProperty({ example: 1, minimum: 1, description: 'New day number (1 = first day).' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  newPosition: number;
}
