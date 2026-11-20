import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

// FLT-28: a single passenger seat selection on one segment
export class SeatAssignmentInputDto {
  @ApiPropertyOptional({
    description: 'Which flight segment: 0 = outbound (default), 1 = return',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  segmentIndex?: number;

  @ApiPropertyOptional({
    description: '0-based index of the seated passenger in booking.passengers (defaults to 0)',
    example: 0,
    default: 0,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  passengerIndex?: number;

  @ApiPropertyOptional({
    description: 'Seat code combining row number and column letter (e.g. "12A"); alternatively provide row and column',
    example: '12A',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[1-9]\d*[A-Z]$/, { message: 'seat must be a row number followed by a seat letter (e.g. "12A").' })
  seat?: string;

  @ApiPropertyOptional({
    description: 'Seat row number (>= 1); used when seat is not provided as a combined string',
    example: 12,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  row?: number;

  @ApiPropertyOptional({
    description: 'Seat column letter (A-Z); used when seat is not provided as a combined string',
    example: 'A',
  })
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @Matches(/^[A-Z]$/, { message: 'column must be a single uppercase letter (A-Z).' })
  column?: string;
}

// FLT-28: body for PATCH /api/flight-bookings/:id/seat
export class SelectSeatDto extends SeatAssignmentInputDto {
  @ApiPropertyOptional({
    type: [SeatAssignmentInputDto],
    description: 'Optional batch of seat selections across passengers or segments',
  })
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => SeatAssignmentInputDto)
  seats?: SeatAssignmentInputDto[];
}
