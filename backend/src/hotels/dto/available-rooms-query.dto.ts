import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

/** Query for GET /api/hotels/:id/rooms/available (HTL-15). */
export class AvailableRoomsQueryDto {
  @ApiProperty({ example: '2026-12-20', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'checkIn must use YYYY-MM-DD format.' })
  checkIn: string;

  @ApiProperty({ example: '2026-12-24', format: 'date' })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'checkOut must use YYYY-MM-DD format.' })
  checkOut: string;

  @ApiPropertyOptional({ example: 2, minimum: 1, description: 'Only return rooms whose max occupancy covers this many guests.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;
}
