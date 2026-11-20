import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Body for POST /api/hotel-bookings/:id/review (HTL-23). */
export class CreateReviewDto {
  @ApiProperty({ minimum: 1, maximum: 5, example: 5, description: 'Rating 1-5.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ maxLength: 1000, description: 'Optional written review (max 1000 chars).' })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}
