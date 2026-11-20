import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from '../database/database.module.js';
import { HotelBooking, HotelBookingSchema } from '../database/schemas/expense.schema.js';
import { Hotel, HotelSchema, Room, RoomSchema } from '../database/schemas/provider.schema.js';
import { HotelBookingsController } from './hotel-bookings.controller.js';
import { ReviewsController } from './reviews.controller.js';
import { HotelBookingsService } from './hotel-bookings.service.js';

/**
 * Hotel reservations owned by the user: list & detail (HTL-20), cancellation
 * with refund (HTL-21), and reviews (HTL-23 submit/edit/delete, HTL-26 reply).
 *
 * Booking CREATION (HTL-16/17/18) is intentionally NOT here — it belongs to the
 * hotel-booking creation task and plugs into the same HotelBooking schema.
 */
@Module({
  imports: [
    DatabaseModule,
    MongooseModule.forFeature([
      { name: HotelBooking.name, schema: HotelBookingSchema },
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
    ]),
  ],
  controllers: [HotelBookingsController, ReviewsController],
  providers: [HotelBookingsService],
  exports: [HotelBookingsService],
})
export class HotelBookingsModule {}
