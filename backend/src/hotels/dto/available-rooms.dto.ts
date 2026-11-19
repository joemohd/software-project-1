import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/**
 * Query parameters for GET /api/hotels/:id/rooms/available (HTL-15).
 */
export class AvailableRoomsDto {
  @ApiProperty({ example: '2026-12-20', description: 'Check-in date (YYYY-MM-DD).' })
  @IsString()
  checkIn: string;

  @ApiProperty({ example: '2026-12-24', description: 'Check-out date (YYYY-MM-DD).' })
  @IsString()
  checkOut: string;

  @ApiPropertyOptional({ example: 2, minimum: 1, description: 'Optional: only return rooms whose max occupancy covers this many guests.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;
}
