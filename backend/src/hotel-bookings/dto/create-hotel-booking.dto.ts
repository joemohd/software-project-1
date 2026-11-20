import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  CHILD_MAX_AGE,
  DATE_ONLY_PATTERN,
  MAX_GUESTS_PER_ROOM,
  MAX_ROOMS_PER_BOOKING,
} from '../hotel-booking.constants.js';

// HTL-16: one selected room and the guests assigned to it
export class HotelBookingRoomDto {
  @ApiProperty({ description: 'Room id (from the hotel\'s available rooms)', example: '6740c0ffee0000000000c001' })
  @IsMongoId()
  roomId: string;

  @ApiProperty({ description: 'Adults in this room', example: 2, minimum: 0, maximum: MAX_GUESTS_PER_ROOM })
  @IsInt()
  @Min(0)
  @Max(MAX_GUESTS_PER_ROOM)
  adults: number;

  @ApiPropertyOptional({ description: `Age of each child in this room (0-${CHILD_MAX_AGE})`, type: [Number], example: [7] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_GUESTS_PER_ROOM)
  @IsInt({ each: true })
  @Min(0, { each: true })
  @Max(CHILD_MAX_AGE, { each: true })
  childAges?: number[];
}

// HTL-16, HTL-18: book one or more rooms of one hotel for the same dates, held for 10 minutes while paying
export class CreateHotelBookingDto {
  @ApiProperty({ description: 'Hotel id; every room must belong to it', example: '6740c0ffee0000000000d001' })
  @IsMongoId()
  hotelId: string;

  @ApiProperty({ description: 'Check-in date, YYYY-MM-DD (not in the past)', example: '2026-12-01' })
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: 'checkIn must be a date like 2026-12-01' })
  checkIn: string;

  @ApiProperty({ description: 'Check-out date, YYYY-MM-DD (after check-in)', example: '2026-12-04' })
  @IsString()
  @Matches(DATE_ONLY_PATTERN, { message: 'checkOut must be a date like 2026-12-04' })
  checkOut: string;

  @ApiProperty({ type: [HotelBookingRoomDto], description: `1 to ${MAX_ROOMS_PER_BOOKING} rooms, each once` })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_ROOMS_PER_BOOKING)
  @ValidateNested({ each: true })
  @Type(() => HotelBookingRoomDto)
  rooms: HotelBookingRoomDto[];
}
