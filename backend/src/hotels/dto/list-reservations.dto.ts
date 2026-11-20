import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';
import { BookingStatus } from '../../database/schemas/expense.schema.js';

/** Query for GET /api/hotels/:id/reservations (HTL-22, hotel moderator). */
export class ListReservationsDto {
  @ApiPropertyOptional({ enum: BookingStatus, description: 'Filter by reservation status.' })
  @IsOptional()
  @IsIn(Object.values(BookingStatus))
  status?: BookingStatus;

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
