import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ITINERARY_MAX_DAYS, SEARCH_MAX_LENGTH } from '../itineraries.constants.js';
import { ItineraryPageQueryDto } from './pagination-query.dto.js';
import { TrimString, UpperCode } from './transforms.js';

// ITN-18: optional display currency; defaults to the user's preferred currency
export class BudgetSummaryQueryDto {
  @ApiPropertyOptional({ example: 'EGP', description: "Defaults to your profile's preferred currency." })
  @IsOptional()
  @UpperCode()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter currency code' })
  currency?: string;
}

// ITN-21: keyword search over public itineraries with duration and place filters
export class PublicSearchQueryDto extends ItineraryPageQueryDto {
  @ApiPropertyOptional({ description: 'Matches the title, a country name/code or a city name.', maxLength: SEARCH_MAX_LENGTH })
  @IsOptional()
  @TrimString()
  @IsString()
  @MaxLength(SEARCH_MAX_LENGTH)
  q?: string;

  @ApiPropertyOptional({ example: 'EG', description: 'Country code filter.' })
  @IsOptional()
  @UpperCode()
  @Matches(/^[A-Z]{2}$/, { message: 'country must be a 2-letter country code' })
  country?: string;

  @ApiPropertyOptional({ description: 'City id filter.' })
  @IsOptional()
  @IsMongoId()
  cityId?: string;

  @ApiPropertyOptional({ minimum: 0, maximum: ITINERARY_MAX_DAYS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ITINERARY_MAX_DAYS)
  minDays?: number;

  @ApiPropertyOptional({ minimum: 0, maximum: ITINERARY_MAX_DAYS })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(ITINERARY_MAX_DAYS)
  maxDays?: number;
}

// ITN-25: hotels for one city group of the itinerary
export class ItineraryHotelsQueryDto {
  @ApiProperty({ example: 0, minimum: 0, description: 'City group index from the itinerary details (cityGroups[].index).' })
  @Type(() => Number)
  @IsInt()
  @Min(0)
  groupIndex: number;

  @ApiProperty({ example: 2, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests: number;

  @ApiProperty({ example: 1, minimum: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  rooms: number;
}

// ITN-26: flights from a chosen origin airport to the city of the first day
export class ItineraryFlightsQueryDto {
  @ApiProperty({ example: 'CAI', description: 'Origin airport IATA code.' })
  @UpperCode()
  @Matches(/^[A-Z]{3}$/, { message: 'origin must be a 3-letter IATA code' })
  origin: string;

  @ApiPropertyOptional({ enum: ['one-way', 'round-trip'], default: 'round-trip' })
  @IsOptional()
  @IsIn(['one-way', 'round-trip'])
  tripType: 'one-way' | 'round-trip' = 'round-trip';

  @ApiPropertyOptional({ example: '2026-12-20', description: 'Defaults to the itinerary start date.' })
  @IsOptional()
  @IsDateString({ strict: true })
  outboundDate?: string;

  @ApiPropertyOptional({ example: '2026-12-27', description: "Defaults to the last day's date." })
  @IsOptional()
  @IsDateString({ strict: true })
  returnDate?: string;

  @ApiPropertyOptional({ default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  adults: number = 1;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  children: number = 0;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  infants: number = 0;

  @ApiPropertyOptional({ example: 'economy' })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  cabinClass?: string;
}
