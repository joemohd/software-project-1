import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsDateString, IsOptional, Matches } from 'class-validator';

export class HotelDetailsQueryDto {
  @ApiPropertyOptional({ example: '2026-12-20', format: 'date' })
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'checkIn must use YYYY-MM-DD format.',
  })
  checkIn?: string;

  @ApiPropertyOptional({ example: '2026-12-24', format: 'date' })
  @IsOptional()
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'checkOut must use YYYY-MM-DD format.',
  })
  checkOut?: string;
}
