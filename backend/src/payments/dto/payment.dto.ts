import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Equals, IsBoolean, IsIn, IsMongoId, IsOptional, Matches } from 'class-validator';
import { BookingStatus, PaymentIntentStatus } from '../../database/schemas/expense.schema.js';

export const BOOKING_TYPES = ['flight', 'hotel'] as const;
export type BookingType = (typeof BOOKING_TYPES)[number];

// Stripe test-mode payment methods, so the whole flow can be tried from Swagger without a frontend.
// These are Stripe's public test tokens, not card numbers: card details never reach the backend (PAY-01).
export const TEST_PAYMENT_METHODS = ['pm_card_visa', 'pm_card_mastercard', 'pm_card_chargeDeclined', 'pm_card_chargeDeclinedInsufficientFunds'] as const;
export type TestPaymentMethod = (typeof TEST_PAYMENT_METHODS)[number];

// :type/:id in /api/bookings/:type/:id/...
export class BookingParamsDto {
  @ApiProperty({ enum: BOOKING_TYPES, example: 'flight' })
  @IsIn(BOOKING_TYPES)
  type: BookingType;

  @ApiProperty({ description: 'Booking id', example: '6740c0ffee0000000000b001' })
  @IsMongoId()
  id: string;
}

// PAY-02: the "I accept the policies" checkbox
export class AcceptPoliciesDto {
  @ApiProperty({ example: true, description: 'Must be true' })
  @IsBoolean()
  @Equals(true, { message: 'You must accept the policies to continue.' })
  accepted: boolean;
}

export class PaymentIdParamDto {
  @ApiProperty({ description: 'Stripe PaymentIntent id returned by POST /api/payments', example: 'pi_3QxYzAbCdEf' })
  @Matches(/^pi_[A-Za-z0-9]+$/, { message: 'id must be a Stripe PaymentIntent id (pi_...)' })
  id: string;
}

export class TestPaymentMethodDto {
  @ApiPropertyOptional({
    enum: TEST_PAYMENT_METHODS,
    description:
      'Test mode only: pay right away with a Stripe test payment method (pm_card_visa succeeds, pm_card_chargeDeclined fails). ' +
      'Leave it out when a frontend confirms the payment with the returned clientSecret.',
  })
  @IsOptional()
  @IsIn(TEST_PAYMENT_METHODS)
  testPaymentMethod?: TestPaymentMethod;
}

// PAY-01: start paying for a Pending Payment booking
export class CreatePaymentDto extends TestPaymentMethodDto {
  @ApiProperty({ enum: BOOKING_TYPES, example: 'flight' })
  @IsIn(BOOKING_TYPES)
  bookingType: BookingType;

  @ApiProperty({ example: '6740c0ffee0000000000b001' })
  @IsMongoId()
  bookingId: string;
}

export class RetryPaymentDto extends TestPaymentMethodDto {}

export class PaymentResponseDto {
  @ApiProperty({ description: 'Stripe PaymentIntent id', example: 'pi_3QxYzAbCdEf' }) id: string;
  @ApiProperty({ enum: BOOKING_TYPES }) bookingType: BookingType;
  @ApiProperty() bookingId: string;
  @ApiProperty({ description: 'Amount in cents', example: 99500 }) amount: number;
  @ApiProperty({ example: 'usd' }) currency: string;
  @ApiProperty({ enum: PaymentIntentStatus, description: 'succeeded = paid' }) status: PaymentIntentStatus;
  @ApiProperty({ enum: BookingStatus, description: 'Confirmed only after the backend verified the payment' }) bookingStatus: BookingStatus;
  @ApiProperty({ nullable: true, type: String, description: 'For the frontend (Stripe Elements) to confirm the payment' })
  clientSecret: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'Your card was declined.' }) lastError: string | null;
  @ApiProperty({ nullable: true, type: String, description: 'Pay before this (UTC)' }) holdExpiresAt: string | null;
}

export class RefundTierDto {
  @ApiProperty({ description: 'Applies when at least this many days are left', example: 7 }) daysBefore: number;
  @ApiProperty({ example: 50 }) refundPercentage: number;
}

export class BaggagePolicyDto {
  @ApiProperty({ description: 'Price per extra bag in cents', example: 2500 }) priceExtraBag: number;
  @ApiProperty({ example: 2 }) maxExtraBagCount: number;
  @ApiProperty({ nullable: true, type: Number, example: 23 }) maxBagWeightKg: number | null;
}

// PAY-02: one provider's policies (airline: cancellation + baggage; hotel: cancellation + check-in/out times)
export class ProviderPoliciesDto {
  @ApiProperty({ enum: ['airline', 'hotel'] }) providerType: 'airline' | 'hotel';
  @ApiProperty() providerId: string;
  @ApiProperty({ example: 'EgyptAir' }) name: string;
  @ApiProperty({ type: [RefundTierDto], description: 'Highest threshold not above the days left applies; none → 0%' })
  cancellationTiers: RefundTierDto[];
  @ApiPropertyOptional({ type: BaggagePolicyDto }) baggage?: BaggagePolicyDto;
  @ApiPropertyOptional({ example: '14:00', nullable: true, type: String }) checkInTime?: string | null;
  @ApiPropertyOptional({ example: '12:00', nullable: true, type: String }) checkOutTime?: string | null;
}

export class BookingPoliciesResponseDto {
  @ApiProperty({ enum: BOOKING_TYPES }) bookingType: BookingType;
  @ApiProperty() bookingId: string;
  @ApiProperty() accepted: boolean;
  @ApiProperty({ nullable: true, type: String, description: 'When the user accepted (UTC)' }) acceptedAt: string | null;
  @ApiProperty({ type: [ProviderPoliciesDto] }) providers: ProviderPoliciesDto[];
}

export class RefundIdParamDto {
  @ApiProperty({ description: 'Refund id' })
  @IsMongoId()
  id: string;
}

// PAY-03
export class RefundResponseDto {
  @ApiProperty() id: string;
  @ApiProperty({ enum: BOOKING_TYPES }) bookingType: BookingType;
  @ApiProperty() bookingId: string;
  @ApiProperty({ description: 'Amount in cents', example: 49750 }) amount: number;
  @ApiProperty({ example: 'usd' }) currency: string;
  @ApiProperty({ enum: ['Pending', 'Refunded', 'Failed'] }) status: 'Pending' | 'Refunded' | 'Failed';
  @ApiProperty({ nullable: true, type: String, description: "Stripe's own status" }) stripeStatus: string | null;
  @ApiProperty({ nullable: true, type: String }) failureReason: string | null;
  @ApiProperty() createdAt: string;
}
