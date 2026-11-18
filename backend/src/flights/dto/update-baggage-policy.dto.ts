import { ApiProperty } from '@nestjs/swagger';
import { IsInt, Max, Min } from 'class-validator';

// FLT-08: body for PUT /api/airlines/:id/baggage-policy (replaces the whole policy)
export class UpdateBaggagePolicyDto {
  @ApiProperty({ description: 'Price per extra bag in cents (must be > 0)', example: 2500, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  priceExtraBag: number;

  @ApiProperty({ description: 'Maximum extra bags per passenger (>= 0)', example: 2, minimum: 0 })
  @IsInt()
  @Min(0)
  @Max(Number.MAX_SAFE_INTEGER)
  maxExtraBagCount: number;
}

// FLT-08: the stored policy, as returned after an update
export class BaggagePolicyResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  airlineId: string;

  @ApiProperty({ description: 'Cents', example: 2500 })
  priceExtraBag: number;

  @ApiProperty({ example: 2 })
  maxExtraBagCount: number;
}
