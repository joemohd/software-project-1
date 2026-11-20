import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Min } from 'class-validator';
import { BookingStatus, PassengerType } from '../../database/schemas/expense.schema.js';
import { CabinType } from '../../database/schemas/flight.schema.js';

// FLT-29: query for GET /api/flights/:id/bookings
export class FlightBookingsQueryDto {
  @ApiPropertyOptional({ description: 'Page number, starting at 1', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;
}

export class ManifestPassengerDto {
  @ApiProperty({ example: 'Mona Hassan' }) fullName: string;
  @ApiProperty({ enum: PassengerType }) type: PassengerType;
  @ApiProperty({ nullable: true, type: String, example: '12A', description: 'Seat on this flight; null for infants' }) seat: string | null;
  @ApiProperty({ type: [Number], description: 'Extra bag weights in kg' }) extraBagWeights: number[];
}

// FLT-29: one booking on the flight (no passport numbers)
export class FlightBookingEntryDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'K7M2QX' }) reference: string;
  @ApiProperty({ enum: [BookingStatus.CONFIRMED, BookingStatus.CANCELLED] }) status: BookingStatus;
  @ApiProperty({ enum: CabinType }) cabinName: CabinType;
  @ApiProperty({ type: [ManifestPassengerDto] }) passengers: ManifestPassengerDto[];
}

export class CabinSeatsDto {
  @ApiProperty({ enum: CabinType }) name: CabinType;
  @ApiProperty({ example: 156 }) seatCount: number;
  @ApiProperty({ description: 'Seats still available to book', example: 120 }) availableSeats: number;
}

// FLT-29: the flight's Confirmed and Cancelled bookings, 10 per page, newest first, plus seats remaining per cabin
export class FlightBookingsReportDto {
  @ApiProperty() flightId: string;
  @ApiProperty({ type: [CabinSeatsDto] }) cabins: CabinSeatsDto[];
  @ApiProperty({ type: [FlightBookingEntryDto] }) items: FlightBookingEntryDto[];
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 10 }) pageSize: number;
  @ApiProperty({ example: 42 }) total: number;
}
