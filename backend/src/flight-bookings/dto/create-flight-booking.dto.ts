import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { CabinType } from '../../database/schemas/flight.schema.js';
import { MAX_BAG_WEIGHT_KG } from '../../flights/flights.constants.js';
import {
  DATE_ONLY_PATTERN,
  MAX_EXTRA_BAGS_PER_PASSENGER,
  MAX_PASSENGERS_PER_BOOKING,
  PASSPORT_NUMBER_PATTERN,
} from '../flight-bookings.constants.js';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

// FLT-19/FLT-21: one flight of the booking and the cabin to sit in
export class BookingSegmentDto {
  @ApiProperty({ description: 'Flight id', example: '6740c0ffee0000000000a001' })
  @IsMongoId()
  flightId: string;

  @ApiProperty({ enum: CabinType, example: CabinType.ECONOMY })
  @IsEnum(CabinType)
  cabinName: CabinType;
}

// FLT-19: one passenger; the type (adult/child/infant) is worked out from the date of birth
export class BookingPassengerDto {
  @ApiProperty({ example: 'Mona Hassan', minLength: 1, maxLength: 100 })
  @Transform(trim)
  @IsString()
  @Length(1, 100)
  fullName: string;

  @ApiProperty({ description: 'Calendar date, YYYY-MM-DD', example: '1990-05-31' })
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: 'dateOfBirth must be a date like 1990-05-31' })
  dateOfBirth: string;

  @ApiProperty({
    description: 'Passport or national ID number, 5-20 letters and digits',
    example: 'A12345678',
    pattern: '^[A-Za-z0-9]{5,20}$',
    minLength: 5,
    maxLength: 20,
  })
  @Transform(trim)
  @IsString()
  @Matches(PASSPORT_NUMBER_PATTERN, { message: 'passportNumber must be 5-20 letters and digits' })
  passportNumber: string;

  @ApiPropertyOptional({
    description:
      "Weight in whole kg of each extra bag (count up to the airline's maximum, each up to the booked cabin's free baggage weight allowance per FLT-08)",
    type: [Number],
    example: [20],
    default: [],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_EXTRA_BAGS_PER_PASSENGER)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(MAX_BAG_WEIGHT_KG, { each: true })
  extraBagWeights?: number[];
}

// FLT-19, FLT-21: one segment = one-way, two segments = round trip (outbound first)
export class CreateFlightBookingDto {
  @ApiProperty({ type: [BookingSegmentDto], minItems: 1, maxItems: 2, description: '1 = one-way, 2 = round trip (outbound, then return)' })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2)
  @ValidateNested({ each: true })
  @Type(() => BookingSegmentDto)
  segments: BookingSegmentDto[];

  @ApiProperty({ type: [BookingPassengerDto], minItems: 1, maxItems: MAX_PASSENGERS_PER_BOOKING })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_PASSENGERS_PER_BOOKING)
  @ValidateNested({ each: true })
  @Type(() => BookingPassengerDto)
  passengers: BookingPassengerDto[];
}
