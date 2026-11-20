import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsMongoId, IsOptional, Max, Min } from 'class-validator';
import { PaymentIntentStatus } from '../../database/schemas/expense.schema.js';
import { RefundResponseDto, TestPaymentMethodDto } from '../../payments/dto/payment.dto.js';
import { FlightBookingResponseDto } from './flight-booking-response.dto.js';

// FLT-27: move one flight of a Confirmed booking to another date or flight (same route, cabin and airline)
export class ChangeFlightDto extends TestPaymentMethodDto {
  @ApiPropertyOptional({ description: 'Which flight to change: 0 = outbound (default), 1 = return', example: 0, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1)
  segmentIndex?: number;

  @ApiProperty({ description: 'The new flight: same departure and arrival airports and airline, with the same cabin', example: '6740c0ffee0000000000a002' })
  @IsMongoId()
  flightId: string;
}

export const CHANGE_OUTCOMES = ['changed', 'payment_required'] as const;
export type ChangeOutcome = (typeof CHANGE_OUTCOMES)[number];

// FLT-27: the payment for a fare difference
export class ChangePaymentDto {
  @ApiProperty({ example: 'pi_3QxYzAbCdEf' }) paymentIntentId: string;
  @ApiProperty({ description: 'Fare difference in cents', example: 12000 }) amount: number;
  @ApiProperty({ enum: PaymentIntentStatus }) status: PaymentIntentStatus;
  @ApiProperty({ nullable: true, type: String, description: 'Confirm it with Stripe Elements; null once paid' }) clientSecret: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Why the last attempt failed' }) lastError: string | null;
  @ApiProperty({ description: 'Pay before this (UTC), or the new seats are released', example: '2026-11-19T12:10:00.000Z' })
  holdExpiresAt: string;
}

// FLT-27: result of a flight change
export class ChangeFlightResponseDto {
  @ApiProperty({
    enum: CHANGE_OUTCOMES,
    description: '"changed": done (a lower fare is refunded). "payment_required": pay the difference to finish the change.',
  })
  outcome: ChangeOutcome;

  @ApiProperty({ description: 'New fare minus old fare in cents (negative = refund)', example: 12000 }) fareDifference: number;
  @ApiProperty({ type: FlightBookingResponseDto }) booking: FlightBookingResponseDto;
  @ApiProperty({ type: ChangePaymentDto, nullable: true, description: 'Set when the difference has to be paid' }) payment: ChangePaymentDto | null;
  @ApiProperty({ type: [RefundResponseDto], description: 'Refunds of a lower fare (empty if none)' }) refunds: RefundResponseDto[];
  @ApiProperty({ nullable: true, type: String, description: 'Set if the change was made but Stripe refused the refund' })
  refundError: string | null;
}
