import { ApiProperty } from '@nestjs/swagger';
import { IsIn } from 'class-validator';
import { DateRangeDto } from './date-range.dto.js';

export class UpdateAvailabilityDto extends DateRangeDto {
  @ApiProperty({ enum: ['block', 'unblock'], example: 'block' })
  @IsIn(['block', 'unblock'])
  action: 'block' | 'unblock';
}
