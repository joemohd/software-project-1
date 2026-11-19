import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  Max,
} from 'class-validator';

/**
 * Query parameters for GET /api/hotels/search (HTL-11 search + HTL-12 filter/sort).
 */
export class SearchHotelsDto {
  @ApiPropertyOptional({ description: 'City to search in (case-insensitive).' })
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional({ description: 'Country to search in (case-insensitive).' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiProperty({ example: '2026-12-20', description: 'Check-in date (YYYY-MM-DD).' })
  @IsString()
  checkIn: string;

  @ApiProperty({ example: '2026-12-24', description: 'Check-out date (YYYY-MM-DD).' })
  @IsString()
  checkOut: string;

  @ApiProperty({ example: 2, minimum: 1, description: 'Total number of guests.' })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests: number;

  @ApiPropertyOptional({ example: 1, minimum: 1, default: 1, description: 'Number of rooms required.' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rooms: number = 1;

  @ApiPropertyOptional({ minimum: 0, description: 'Minimum price per night (cheapest qualifying room).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({ minimum: 0, description: 'Maximum price per night (cheapest qualifying room).' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 5, description: 'Minimum average rating; unrated hotels are excluded when set.' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number;

  @ApiPropertyOptional({ enum: ['price', 'rating'], description: 'Sort field.' })
  @IsOptional()
  @IsIn(['price', 'rating'])
  sortBy?: 'price' | 'rating';

  @ApiPropertyOptional({ enum: ['asc', 'desc'], default: 'asc' })
  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder: 'asc' | 'desc' = 'asc';

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 10;
}
