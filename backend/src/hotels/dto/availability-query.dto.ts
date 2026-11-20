import { ApiProperty } from '@nestjs/swagger';
import { IsDateString, Matches } from 'class-validator';

export class AvailabilityQueryDto {
  @ApiProperty({ example: '2026-12-20', format: 'date' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'startDate must use YYYY-MM-DD format.',
  })
  startDate: string;

  @ApiProperty({ example: '2026-12-24', format: 'date' })
  @IsDateString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'endDate must use YYYY-MM-DD format.',
  })
  endDate: string;
}
