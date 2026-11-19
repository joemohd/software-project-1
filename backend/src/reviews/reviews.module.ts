import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ReviewsService } from './reviews.service.js';
import { ReviewsController } from './reviews.controller.js';
import { Review, ReviewSchema } from './schemas/review.schema.js';
import { Hotel, HotelSchema } from '../hotels/schemas/hotel.schema.js';
import {
  HotelBooking,
  HotelBookingSchema,
} from '../hotel-bookings/schemas/hotel-booking.schema.js';

/**
 * Owns the Review schema and all review business logic (HTL-23/24/26).
 * Exports ReviewsService so the Hotels and Hotel-Bookings modules can reuse it
 * (review submission lives under /hotel-bookings, review listing under /hotels).
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Review.name, schema: ReviewSchema },
      { name: Hotel.name, schema: HotelSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
    ]),
  ],
  controllers: [ReviewsController],
  providers: [ReviewsService],
  exports: [ReviewsService],
})
export class ReviewsModule {}
