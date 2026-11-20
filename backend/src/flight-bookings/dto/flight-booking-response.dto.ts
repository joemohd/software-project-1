import { ApiProperty } from '@nestjs/swagger';
import { BookingStatus, PassengerType } from '../../database/schemas/expense.schema.js';
import { CabinType } from '../../database/schemas/flight.schema.js';

export class BookingAirportDto {
  @ApiProperty() airportId: string;
  @ApiProperty({ example: 'CAI' }) iataCode: string;
  @ApiProperty({ description: 'UTC', example: '2026-12-01T08:00:00.000Z' }) timestamp: string;
  @ApiProperty({ description: "Local time at the airport", example: '2026-12-01T10:00' }) localTime: string;
  @ApiProperty({ example: 'Africa/Cairo' }) timeZone: string;
}

// FLT-21: one flight of the booking with its agreed price
export class BookingSegmentResponseDto {
  @ApiProperty() flightId: string;
  @ApiProperty({ example: 'MS 123' }) flightNumber: string;
  @ApiProperty({ example: 'EgyptAir' }) airlineName: string;
  @ApiProperty({ type: BookingAirportDto }) departure: BookingAirportDto;
  @ApiProperty({ type: BookingAirportDto }) arrival: BookingAirportDto;
  @ApiProperty({ enum: CabinType }) cabinName: CabinType;
  @ApiProperty({ description: 'Seat price in cents, agreed at booking time', example: 45000 }) seatPrice: number;
  @ApiProperty({ description: 'Infant fare in cents (10% of the seat price)', example: 4500 }) infantPrice: number;
  @ApiProperty({ example: 2 }) seatedPassengers: number;
  @ApiProperty({ example: 1 }) infants: number;
  @ApiProperty({ description: 'Fare for this flight in cents', example: 94500 }) fare: number;
}

export class PassengerSeatDto {
  @ApiProperty({ description: '0 = outbound, 1 = return', example: 0 }) segment: number;
  @ApiProperty({ example: '12A' }) seat: string;
}

// FLT-21: one passenger with their type and seats (infants have none)
export class BookingPassengerResponseDto {
  @ApiProperty() fullName: string;
  @ApiProperty({ example: '1990-05-31' }) dateOfBirth: string;
  @ApiProperty({ enum: PassengerType }) type: PassengerType;
  @ApiProperty() passportNumber: string;
  @ApiProperty({ type: [Number], description: 'Extra bag weights in kg' }) extraBagWeights: number[];
  @ApiProperty({ type: [PassengerSeatDto] }) seats: PassengerSeatDto[];
}

// FLT-21: booking summary shown before payment
export class FlightBookingResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ example: 'K7M2QX', nullable: true, type: String, description: 'Shown once the booking is Confirmed; null before' })
  reference: string | null;
  @ApiProperty({ enum: BookingStatus, example: BookingStatus.PENDING_PAYMENT }) status: BookingStatus;
  @ApiProperty({ type: [BookingSegmentResponseDto] }) segments: BookingSegmentResponseDto[];
  @ApiProperty({ type: [BookingPassengerResponseDto] }) passengers: BookingPassengerResponseDto[];
  @ApiProperty({ description: 'Sum of the segment fares in cents', example: 94500 }) fareTotal: number;
  @ApiProperty({ description: 'Extra baggage fee in cents', example: 5000 }) baggageFee: number;
  @ApiProperty({ description: 'fareTotal + baggageFee in cents', example: 99500 }) total: number;
  @ApiProperty({ nullable: true, description: 'When the seat hold ends (UTC); pay before this', example: '2026-11-19T12:10:00.000Z' })
  holdExpiresAt: string | null;
}

// FLT-25: one page of one group
export class FlightBookingGroupPageDto {
  @ApiProperty({ type: [FlightBookingResponseDto] }) items: FlightBookingResponseDto[];
  @ApiProperty({ example: 1 }) page: number;
  @ApiProperty({ example: 10 }) pageSize: number;
  @ApiProperty({ example: 3 }) total: number;
}

// FLT-25: the user's bookings grouped as Upcoming, Past and Cancelled (Expired counts as Cancelled), newest first
export class FlightBookingListResponseDto {
  @ApiProperty({ type: FlightBookingGroupPageDto }) upcoming: FlightBookingGroupPageDto;
  @ApiProperty({ type: FlightBookingGroupPageDto }) past: FlightBookingGroupPageDto;
  @ApiProperty({ type: FlightBookingGroupPageDto }) cancelled: FlightBookingGroupPageDto;
}
