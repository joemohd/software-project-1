import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsIn, IsInt, IsMongoId, IsOptional, IsString, Matches, Min } from 'class-validator';
import { CabinType, FlightStatus } from '../../database/schemas/flight.schema.js';

export const FLIGHT_SORT_FIELDS = ['price', 'duration', 'departureTime'] as const;
export type FlightSortBy = (typeof FLIGHT_SORT_FIELDS)[number];

export const SORT_ORDERS = ['asc', 'desc'] as const;
export type SortOrder = (typeof SORT_ORDERS)[number];

// FLT-11, FLT-12, FLT-15: query parameters for GET /api/flights/search
export class SearchFlightsQueryDto {
  @ApiProperty({
    description: 'Departure airport id from GET /api/airports (FLT-02, FLT-11)',
    example: '665f1c2e9b1e8a001234567a',
  })
  @IsMongoId()
  departureAirportId: string;

  @ApiProperty({
    description: 'Arrival airport id from GET /api/airports (FLT-02, FLT-11)',
    example: '665f1c2e9b1e8a001234567b',
  })
  @IsMongoId()
  arrivalAirportId: string;

  @ApiProperty({
    description: 'Local departure date at the departure airport (YYYY-MM-DD, FLT-11)',
    example: '2026-12-01',
  })
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'departureDate must use YYYY-MM-DD format.' })
  departureDate: string;

  @ApiPropertyOptional({
    description: 'Local return departure date for round-trip search (YYYY-MM-DD, FLT-12)',
    example: '2026-12-08',
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
    description: 'Number of child passengers (ages 2-11, occupy a seat and pay cabin fare, FLT-12)',
    default: 0,
    minimum: 0,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  children: number = 0;

  @ApiPropertyOptional({
    description: 'Number of infant passengers (age <2, occupy no seat, pay 10% fare, at most adults, FLT-12)',
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
    description: 'Optional cabin class filter (Economy, Premium Economy, Business, First, FLT-12)',
  })
  @IsOptional()
  @IsEnum(CabinType)
  cabin?: CabinType;

  @ApiPropertyOptional({
    description: 'Inclusive minimum cabin seat price in cents (FLT-15)',
    minimum: 0,
    example: 20000,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minPrice?: number;

  @ApiPropertyOptional({
    description: 'Inclusive maximum cabin seat price in cents (FLT-15)',
    minimum: 0,
    example: 150000,
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

export class FlightSearchAirlineDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  id: string;

  @ApiProperty({ example: 'EgyptAir' })
  name: string;

  @ApiProperty({ example: 'MS' })
  iataCode: string;

  @ApiProperty({ nullable: true, type: String, example: 'https://example.com/logo.png' })
  logoUrl: string | null;
}

export class FlightSearchStopDto {
  @ApiProperty({ example: '665f1c2e9b1e8a001234567a' })
  airportId: string;

  @ApiProperty({ example: 'CAI' })
  iataCode: string;

  @ApiProperty({ example: 'Cairo International Airport' })
  airportName: string;

  @ApiProperty({ description: 'Stored UTC instant', example: '2026-12-01T08:00:00.000Z' })
  timestamp: string;

  @ApiProperty({ description: 'Local time at the airport (GEN-06)', example: '2026-12-01T10:00' })
  localTime: string;

  @ApiProperty({ example: 'Africa/Cairo' })
  timeZone: string;
}

export class FlightSearchCabinDto {
  @ApiProperty({ enum: CabinType, example: CabinType.ECONOMY })
  name: CabinType;

  @ApiProperty({ description: 'Price per seat in cents', example: 45000 })
  seatPrice: number;

  @ApiProperty({ description: 'Free baggage allowance in kg', example: 23 })
  freeBagWeight: number;

  @ApiProperty({ description: 'Total seats in this cabin', example: 156 })
  seatCount: number;

  @ApiProperty({ description: 'Available seats (total - booked - held)', example: 120 })
  availableSeats: number;

  @ApiProperty({
    description: 'Total segment fare in cents for the requested passengers (adults + children at 100%, infants at 10%)',
    example: 94500,
  })
  totalFare: number;
}

export class FlightSearchItemDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345680' })
  id: string;

  @ApiProperty({ type: FlightSearchAirlineDto })
  airline: FlightSearchAirlineDto;

  @ApiProperty({ example: '123' })
  number: string;

  @ApiProperty({ enum: FlightStatus, example: FlightStatus.SCHEDULED })
  status: FlightStatus;

  @ApiProperty({ type: FlightSearchStopDto })
  departure: FlightSearchStopDto;

  @ApiProperty({ type: FlightSearchStopDto })
  arrival: FlightSearchStopDto;

  @ApiProperty({ description: 'Flight duration in minutes', example: 270 })
  durationMinutes: number;

  @ApiProperty({ description: 'Maximum weight per bag in kg', example: 32 })
  maxBagWeight: number;

  @ApiProperty({ description: 'Lowest qualifying cabin seat price in cents', example: 45000 })
  lowestSeatPrice: number;

  @ApiProperty({ description: 'Lowest qualifying cabin total fare for all passengers in cents', example: 94500 })
  lowestTotalFare: number;

  @ApiProperty({ type: [FlightSearchCabinDto] })
  cabins: FlightSearchCabinDto[];
}

export class FlightSearchLegPageDto {
  @ApiProperty({ type: [FlightSearchItemDto] })
  items: FlightSearchItemDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

export class FlightSearchPassengersDto {
  @ApiProperty({ example: 1 })
  adults: number;

  @ApiProperty({ example: 0 })
  children: number;

  @ApiProperty({ example: 0 })
  infants: number;

  @ApiProperty({ description: 'Seats required (adults + children; infants occupy no seat)', example: 1 })
  seatsRequired: number;
}

// FLT-11, FLT-12, FLT-15: search response for one-way or round-trip flight search
export class SearchFlightsResponseDto {
  @ApiProperty({ enum: ['one-way', 'round-trip'], example: 'one-way' })
  tripType: 'one-way' | 'round-trip';

  @ApiProperty({ type: FlightSearchPassengersDto })
  passengers: FlightSearchPassengersDto;

  @ApiProperty({ type: FlightSearchLegPageDto })
  outbound: FlightSearchLegPageDto;

  @ApiProperty({ type: FlightSearchLegPageDto, nullable: true })
  return: FlightSearchLegPageDto | null;

  @ApiProperty({
    nullable: true,
    type: String,
    example: null,
    description: '"No flights found." when no flights match the criteria (FLT-11), otherwise null',
  })
  message: string | null;
}
