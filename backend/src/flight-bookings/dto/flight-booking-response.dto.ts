import { ApiProperty } from '@nestjs/swagger';
import { RefundResponseDto } from '../../payments/dto/payment.dto.js';
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

// FLT-27: a flight change waiting for its fare difference to be paid
export class PendingFlightChangeDto {
  @ApiProperty({ description: '0 = outbound, 1 = return', example: 0 }) segmentIndex: number;
  @ApiProperty() flightId: string;
  @ApiProperty({ description: 'Fare difference to pay in cents', example: 12000 }) amountDue: number;
  @ApiProperty({ example: 'pi_3QxYzAbCdEf' }) paymentIntentId: string;
  @ApiProperty({ example: 'requires_payment_method' }) paymentStatus: string;
  @ApiProperty({ description: 'The new seats are released after this (UTC)' }) holdExpiresAt: string;
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
  @ApiProperty({
    type: String,
    nullable: true,
    description: 'When the seat hold ends (UTC); pay before this',
    example: '2026-11-19T12:10:00.000Z',
  })
  holdExpiresAt: string | null;
  @ApiProperty({ type: PendingFlightChangeDto, nullable: true, description: 'FLT-27: a change waiting for payment, or null' })
  pendingChange: PendingFlightChangeDto | null;
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

// FLT-26: what cancelling now would refund, shown before the user confirms
export class CancellationQuoteDto {
  @ApiProperty() bookingId: string;
  @ApiProperty({ description: 'Whether the booking can be cancelled now' }) cancellable: boolean;
  @ApiProperty({ nullable: true, type: String, description: 'Why it cannot be cancelled' }) reason: string | null;
  @ApiProperty({ description: 'Amount paid in cents', example: 99500 }) totalPaid: number;
  @ApiProperty({ description: 'Whole days left before the outbound departure', example: 12 }) daysBeforeDeparture: number;
  @ApiProperty({ description: "From the airline's cancellation tiers (FLT-09)", example: 50 }) refundPercentage: number;
  @ApiProperty({ description: 'Refund in cents', example: 49750 }) refundAmount: number;
}

// FLT-26, PAY-03: the cancelled booking and its refund
export class CancelFlightBookingResponseDto {
  @ApiProperty({ type: FlightBookingResponseDto }) booking: FlightBookingResponseDto;
  @ApiProperty({ example: 50 }) refundPercentage: number;
  @ApiProperty({ description: 'Refund in cents', example: 49750 }) refundAmount: number;
  @ApiProperty({ type: RefundResponseDto, nullable: true, description: 'null when nothing is refunded' }) refund: RefundResponseDto | null;
  @ApiProperty({ nullable: true, type: String, description: 'Set if the booking was cancelled but Stripe refused the refund' })
  refundError: string | null;
}
