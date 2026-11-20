import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsMongoId, IsOptional, IsString, Matches, Min } from 'class-validator';
import { CabinType } from '../../database/schemas/flight.schema.js';
import {
  FLIGHT_SORT_FIELDS,
  type FlightSortBy,
  SearchFlightsResponseDto,
  SORT_ORDERS,
  type SortOrder,
} from '../../flights/dto/search-flights.dto.js';

export const ITINERARY_TRIP_TYPES = ['one-way', 'round-trip'] as const;
export type ItineraryTripType = (typeof ITINERARY_TRIP_TYPES)[number];

// ITN-26: route param for GET /api/itineraries/:id/flights
export class ItineraryIdParamDto {
  @ApiProperty({ description: 'Itinerary id', example: '665f1c2e9b1e8a0012345699' })
  @IsMongoId()
  id: string;
}

// ITN-26: query parameters for GET /api/itineraries/:id/flights
export class SearchItineraryFlightsQueryDto {
  @ApiProperty({
    description: 'Origin departure airport id chosen by the user from GET /api/airports (ITN-26, FLT-02)',
    example: '665f1c2e9b1e8a001234567a',
  })
  @IsMongoId()
  originAirportId: string;

  @ApiPropertyOptional({
    enum: ITINERARY_TRIP_TYPES,
    default: 'one-way',
    description: 'One-way or round-trip search. Round-trip defaults returnDate to the itinerary last day date (ITN-26)',
  })
  @IsOptional()
  @IsIn(ITINERARY_TRIP_TYPES)
  tripType?: ItineraryTripType;

  @ApiPropertyOptional({
    description: 'Outbound departure date (YYYY-MM-DD); defaults to the itinerary start date (ITN-26)',
    example: '2026-12-01',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'departureDate must use YYYY-MM-DD format.' })
  departureDate?: string;

  @ApiPropertyOptional({
    description: "Return departure date (YYYY-MM-DD); defaults to the itinerary's last day date on round-trip searches (ITN-26)",
    example: '2026-12-05',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'returnDate must use YYYY-MM-DD format.' })
  returnDate?: string;

  @ApiPropertyOptional({
    description: 'Total seated passengers shorthand when not splitting adults/children/infants (FLT-11)',
    example: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  passengers?: number;

  @ApiPropertyOptional({
    description: 'Number of adult passengers (age 12+, at least 1, FLT-12)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  adults?: number;

  @ApiPropertyOptional({
    description: 'Number of child passengers (ages 2-11, FLT-12)',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  children: number = 0;

  @ApiPropertyOptional({
    description: 'Number of infant passengers (age <2, at most adults, FLT-12)',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  infants: number = 0;

  @ApiPropertyOptional({
    enum: CabinType,
    description: 'Optional cabin class filter (FLT-12)',
  })
  @IsOptional()
  @IsEnum(CabinType)
  cabin?: CabinType;

  @ApiPropertyOptional({
    description: 'Inclusive minimum cabin seat price in cents (FLT-15)',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Inclusive maximum cabin seat price in cents (FLT-15)',
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  maxPrice?: number;

  @ApiPropertyOptional({
    enum: FLIGHT_SORT_FIELDS,
    description: 'Sort results by price, duration or departureTime (FLT-15)',
  })
  @IsOptional()
  @IsIn(FLIGHT_SORT_FIELDS)
  sortBy?: FlightSortBy;

  @ApiPropertyOptional({
    enum: SORT_ORDERS,
    default: 'asc',
    description: 'Sort direction (asc or desc)',
  })
  @IsOptional()
  @IsIn(SORT_ORDERS)
  sortOrder: SortOrder = 'asc';

  @ApiPropertyOptional({
    description: 'Page number (10 results per page, GEN-05)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;
}

export class ItineraryDestinationCityDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345660' })
  id: string;

  @ApiProperty({ example: 'Cairo' })
  name: string;
}

// ITN-26: flight search response scoped to an itinerary's first-day city and date range
export class ItineraryFlightSearchResponseDto extends SearchFlightsResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345699' })
  itineraryId: string;

  @ApiProperty({ type: ItineraryDestinationCityDto })
  destinationCity: ItineraryDestinationCityDto;

  @ApiProperty({
    type: [String],
    description: "All airports in the city of the itinerary's first day",
    example: ['665f1c2e9b1e8a001234567b'],
  })
  destinationAirportIds: string[];

  @ApiProperty({ description: 'Effective outbound departure date used for the search', example: '2026-12-01' })
  outboundDate: string;

  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Effective return departure date used for a round-trip search, or null for one-way',
    example: '2026-12-05',
  })
  returnDate: string | null;
}
