import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { RefundsService } from './refunds.service.js';
import { StripeService } from './stripe.service.js';

// Stripe access and refunds (PAY-01, PAY-03). Kept apart from PaymentsModule so booking modules can issue refunds and
// cancel payments without importing PaymentsModule (which itself needs the booking modules).
@Module({
  imports: [DatabaseModule],
  providers: [StripeService, RefundsService],
  exports: [StripeService, RefundsService],
})
export class StripeModule {}
