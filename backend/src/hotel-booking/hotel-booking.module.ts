import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { StripeModule } from '../payments/stripe.module.js';
import { HotelHoldExpirySweeper } from './hotel-hold-expiry.sweeper.js';
import { HotelBookingController } from './hotel-booking.controller.js';
import { HotelBookingService } from './hotel-booking.service.js';

// Hotel bookings: create with a 10-minute hold of all selected rooms, and hold expiry (HTL-16, HTL-18)
@Module({
  imports: [DatabaseModule, StripeModule],
  controllers: [HotelBookingController],
  providers: [HotelBookingService, HotelHoldExpirySweeper],
  exports: [HotelBookingService],
})
export class HotelBookingModule {}
