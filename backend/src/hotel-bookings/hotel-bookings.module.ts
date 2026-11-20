import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { HotelBookingsController } from './hotel-bookings.controller.js';
import { ReviewsController } from './reviews.controller.js';
import { HotelBookingsService } from './hotel-bookings.service.js';
import { HotelBookingController } from './hotel-booking.controller.js';
import { HotelBookingService } from './hotel-booking.service.js';
import { HotelHoldExpirySweeper } from './hotel-hold-expiry.sweeper.js';
import { StripeModule } from '../payments/stripe.module.js';

/**
 * Hotel reservations owned by the user: list & detail (HTL-20), cancellation
 * with refund (HTL-21), and reviews (HTL-23 submit/edit/delete, HTL-26 reply).
 *
 * Booking creation, expiry, listing, cancellation, and reviews all use the
 * shared HotelBooking schema and live in this module.
 */
@Module({
  imports: [
    DatabaseModule,
    StripeModule,
  ],
  controllers: [HotelBookingController, HotelBookingsController, ReviewsController],
  providers: [HotelBookingsService, HotelBookingService, HotelHoldExpirySweeper],
  exports: [HotelBookingsService],
})
export class HotelBookingsModule {}
