import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { HotelBookingStatus } from '../../common/enums/hotel-booking-status.enum.js';

/** Query for GET /api/hotels/:id/reservations (HTL-22, hotel moderator). */
export class ListReservationsDto {
  @ApiPropertyOptional({ enum: HotelBookingStatus, description: 'Filter by reservation status.' })
  @IsOptional()
  @IsIn(Object.values(HotelBookingStatus))
  status?: HotelBookingStatus;

  @ApiPropertyOptional({ example: '2026-12-01', description: 'Only reservations with check-in on/after this date.' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ example: '2026-12-31', description: 'Only reservations with check-in on/before this date.' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;
}
