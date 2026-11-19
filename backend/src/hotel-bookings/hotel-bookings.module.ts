import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HotelBookingsService } from './hotel-bookings.service.js';
import { HotelBookingsController } from './hotel-bookings.controller.js';
import {
  HotelBooking,
  HotelBookingSchema,
} from './schemas/hotel-booking.schema.js';
import { Hotel, HotelSchema } from '../hotels/schemas/hotel.schema.js';
import { ReviewsModule } from '../reviews/reviews.module.js';

/**
 * Owns the HotelBooking schema. Endpoints: list my reservations (HTL-20),
 * reservation details (HTL-20), cancel (HTL-21) and submit a review (HTL-23,
 * delegated to ReviewsService).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: Hotel.name, schema: HotelSchema },
    ]),
    ReviewsModule,
  ],
  controllers: [HotelBookingsController],
  providers: [HotelBookingsService],
  exports: [HotelBookingsService],
})
export class HotelBookingsModule {}
