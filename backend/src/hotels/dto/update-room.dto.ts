import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';
import { RoomStatus } from '../../database/schemas/provider.schema.js';
import { DateRangeDto } from './date-range.dto.js';

export class UpdateRoomDto {
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  bedCount?: number;

  @ApiPropertyOptional({ example: 3, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  maxOccupancy?: number;

  @ApiPropertyOptional({
    example: 17500,
    minimum: 1,
    description: 'Price per night in minor currency units (cents, > 0, HTL-05, PAY-04).',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pricePerNight?: number;

  @ApiPropertyOptional({
    enum: RoomStatus,
    description: 'Deactivation is refused while protected reservations exist.',
  })
  @IsOptional()
  @IsEnum(RoomStatus)
  status?: RoomStatus;

  @ApiPropertyOptional({
    type: [DateRangeDto],
    description: 'Replaces all bookable date ranges.',
  })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => DateRangeDto)
  availability?: DateRangeDto[];
}
