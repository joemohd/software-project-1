import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CabinType } from '../../database/schemas/flight.schema.js';
import {
  LOCAL_TIME_PATTERN,
  MAX_BAG_WEIGHT_KG,
  MAX_SEAT_ROW,
  MAX_SEATS_PER_ROW,
  SEAT_LAYOUT_PATTERN,
} from '../flights.constants.js';

const CABIN_TYPE_COUNT = Object.values(CabinType).length;

// FLT-04: one cabin; its seats are generated from the row range and the layout
export class CreateCabinDto {
  @ApiProperty({ enum: CabinType, example: CabinType.ECONOMY, description: 'Each cabin type at most once per flight' })
  @IsEnum(CabinType)
  name: CabinType;

  @ApiProperty({ description: 'Price per seat in cents (> 0)', example: 45000, minimum: 1 })
  @IsInt()
  @Min(1)
  @Max(Number.MAX_SAFE_INTEGER)
  seatPrice: number;

  @ApiPropertyOptional({
    description: 'Total seat count in this cabin (whole number > 0, FLT-04); must match (lastRow - firstRow + 1) * seatsPerRow when provided',
    example: 156,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  seatCount?: number;

  @ApiPropertyOptional({
    description: 'Free baggage allowance in number of bags per passenger (whole number >= 0, FLT-04)',
    example: 1,
    minimum: 0,
    default: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  freeBagCount?: number;

  @ApiProperty({
    description:
      "Maximum weight per bag in whole kg for this cabin's free and extra baggage allowance (0 = none; FLT-04, FLT-08); can't exceed the flight's maxBagWeight",
    example: 23,
    minimum: 0,
    maximum: MAX_BAG_WEIGHT_KG,
  })
  @IsInt()
  @Min(0)
  @Max(MAX_BAG_WEIGHT_KG)
  freeBagWeight: number;

  @ApiProperty({ description: 'First seat row of this cabin (inclusive)', example: 10, minimum: 1, maximum: MAX_SEAT_ROW })
  @IsInt()
  @Min(1)
  @Max(MAX_SEAT_ROW)
  firstRow: number;

  @ApiProperty({ description: 'Last seat row of this cabin (inclusive)', example: 35, minimum: 1, maximum: MAX_SEAT_ROW })
  @IsInt()
  @Min(1)
  @Max(MAX_SEAT_ROW)
  lastRow: number;

  @ApiProperty({
    description: `Seat letters per row with "-" for each aisle (at most ${MAX_SEATS_PER_ROW} seats). Outer letters are window seats, letters next to "-" are aisle seats, the rest are middle.`,
    example: 'ABC-DEF',
    pattern: SEAT_LAYOUT_PATTERN.source,
  })
  @IsString()
  @MaxLength(2 * MAX_SEATS_PER_ROW)
  @Matches(SEAT_LAYOUT_PATTERN, { message: 'layout must be uppercase letter groups separated by "-", e.g. "ABC-DEF"' })
  layout: string;
}

// FLT-03: body for POST /api/flights
export class CreateFlightDto {
  @ApiProperty({ description: 'Your airline', example: '665f1c2e9b1e8a0012345678' })
  @IsMongoId()
  airlineId: string;

  @ApiProperty({ description: 'Flight number, 1-4 digits (FLT-03)', example: '123', pattern: '^\\d{1,4}$', minLength: 1, maxLength: 4 })
  @IsString()
  @Matches(/^\d{1,4}$/, { message: 'number must be 1-4 digits' })
  number: string;

  @ApiProperty({ description: 'An airport from GET /api/airports', example: '665f1c2e9b1e8a001234567a' })
  @IsMongoId()
  departureAirportId: string;

  @ApiProperty({ description: "Local time at the departure airport, no offset", example: '2026-12-01T10:00' })
  @IsString()
  @Matches(LOCAL_TIME_PATTERN, { message: 'departureLocalTime must look like 2026-12-01T10:00 (local time, no offset)' })
  departureLocalTime: string;

  @ApiProperty({ description: 'An airport from GET /api/airports', example: '665f1c2e9b1e8a001234567b' })
  @IsMongoId()
  arrivalAirportId: string;

  @ApiProperty({ description: 'Local time at the arrival airport, no offset', example: '2026-12-01T14:30' })
  @IsString()
  @Matches(LOCAL_TIME_PATTERN, { message: 'arrivalLocalTime must look like 2026-12-01T14:30 (local time, no offset)' })
  arrivalLocalTime: string;

  @ApiProperty({ description: 'Maximum weight per bag in whole kg', example: 32, minimum: 1, maximum: MAX_BAG_WEIGHT_KG })
  @IsInt()
  @Min(1)
  @Max(MAX_BAG_WEIGHT_KG)
  maxBagWeight: number;

  @ApiProperty({ type: [CreateCabinDto], description: `1 to ${CABIN_TYPE_COUNT} cabins` })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(CABIN_TYPE_COUNT)
  @ValidateNested({ each: true })
  @Type(() => CreateCabinDto)
  cabins: CreateCabinDto[];
}
