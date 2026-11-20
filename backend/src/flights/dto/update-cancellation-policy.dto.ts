import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, Max, Min, ValidateNested } from 'class-validator';
import { MAX_CANCELLATION_TIERS } from '../flights.constants.js';

// FLT-09: one refund tier
export class AirlineCancellationTierDto {
  @ApiProperty({
    description: 'Applies when at least this many days remain before departure (whole number >= 0, unique per airline)',
    example: 7,
    minimum: 0,
  })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  daysBeforeDeparture: number;

  @ApiProperty({ description: 'Refund percentage, whole number 0-100', example: 50, minimum: 0, maximum: 100 })
  @IsInt()
  @Min(0)
  @Max(100)
  refundPercentage: number;
}

// FLT-09: body for PUT /api/airlines/:id/cancellation-policy (replaces all tiers; [] means no refunds)
export class UpdateCancellationPolicyDto {
  @ApiProperty({
    type: [AirlineCancellationTierDto],
    description: `Up to ${MAX_CANCELLATION_TIERS} tiers. The refund uses the tier with the highest threshold not exceeding the days remaining; if none applies, the refund is 0%.`,
  })
  @IsArray()
  @ArrayMaxSize(MAX_CANCELLATION_TIERS)
  @ValidateNested({ each: true })
  @Type(() => AirlineCancellationTierDto)
  tiers: AirlineCancellationTierDto[];
}

// FLT-09: the stored tiers, sorted by threshold
export class CancellationPolicyResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  airlineId: string;

  @ApiProperty({ type: [AirlineCancellationTierDto] })
  tiers: AirlineCancellationTierDto[];
}
