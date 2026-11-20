import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class CancellationTierDto {
  @ApiProperty({ example: 7, minimum: 0 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  daysBeforeCheckIn: number;

  @ApiProperty({ example: 75, minimum: 0, maximum: 100 })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  refundPercentage: number;
}

export class UpdateHotelPoliciesDto {
  @ApiProperty({ example: '14:00', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'checkInTime must use HH:mm (24-hour) format.',
  })
  checkInTime: string;

  @ApiProperty({ example: '11:00', pattern: '^([01]\\d|2[0-3]):[0-5]\\d$' })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, {
    message: 'checkOutTime must use HH:mm (24-hour) format.',
  })
  checkOutTime: string;

  @ApiProperty({
    type: [CancellationTierDto],
    example: [
      { daysBeforeCheckIn: 0, refundPercentage: 0 },
      { daysBeforeCheckIn: 7, refundPercentage: 75 },
    ],
  })
  @IsArray()
  @ArrayUnique((tier: CancellationTierDto) => tier.daysBeforeCheckIn, {
    message: 'Cancellation thresholds must be unique.',
  })
  @ValidateNested({ each: true })
  @Type(() => CancellationTierDto)
  cancellationTiers: CancellationTierDto[];
}
