import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { FlightBookingsModule } from '../flight-bookings/flight-bookings.module.js';
import {
  BookingPoliciesController,
  PaymentsController,
  PaymentsWebhookController,
  RefundsController,
} from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { StripeModule } from './stripe.module.js';

// Payments and policies (PAY-01, PAY-02) and refund status (PAY-03), with Stripe in test mode
@Module({
  imports: [DatabaseModule, StripeModule, FlightBookingsModule],
  controllers: [PaymentsController, PaymentsWebhookController, BookingPoliciesController, RefundsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
