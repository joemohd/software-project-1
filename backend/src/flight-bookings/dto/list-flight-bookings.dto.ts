import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';

// FLT-25: query for GET /api/flight-bookings; each group is paged on its own (10 per page)
export class ListFlightBookingsQueryDto {
  @ApiPropertyOptional({ description: 'Page of upcoming bookings, starting at 1', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  upcomingPage?: number;

  @ApiPropertyOptional({ description: 'Page of past bookings, starting at 1', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  pastPage?: number;

  @ApiPropertyOptional({ description: 'Page of cancelled and expired bookings, starting at 1', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  cancelledPage?: number;
}
