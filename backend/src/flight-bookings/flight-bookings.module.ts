import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { StripeModule } from '../payments/stripe.module.js';
import { FlightBookingsController } from './flight-bookings.controller.js';
import { FlightBookingsService } from './flight-bookings.service.js';
import { HoldExpirySweeper } from './hold-expiry.sweeper.js';

// Flight bookings: create with seat hold, hold expiry, confirm after payment, cancel, e-ticket (FLT-19 to FLT-26)
@Module({
  imports: [DatabaseModule, StripeModule],
  controllers: [FlightBookingsController],
  providers: [FlightBookingsService, HoldExpirySweeper],
  exports: [FlightBookingsService],
})
export class FlightBookingsModule {}
