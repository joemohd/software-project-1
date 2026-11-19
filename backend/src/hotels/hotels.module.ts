import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { HotelsService } from './hotels.service.js';
import { HotelsController } from './hotels.controller.js';
import { Hotel, HotelSchema } from './schemas/hotel.schema.js';
import { Room, RoomSchema } from './schemas/room.schema.js';
import {
  HotelBooking,
  HotelBookingSchema,
} from '../hotel-bookings/schemas/hotel-booking.schema.js';
import { ReviewsModule } from '../reviews/reviews.module.js';

/**
 * Owns the Hotel + Room schemas. Endpoints: hotel search (HTL-11/12),
 * available rooms (HTL-15), hotel reviews listing (HTL-24, via ReviewsService)
 * and the moderator reservations view (HTL-22).
 *
 * NOTE: the Hotel/Room schemas are shared foundation — if the Hotels-CRUD
 * teammate (HTL-01..10) owns them, register them in ONE module only and import
 * that module here instead of re-declaring the schemas.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Hotel.name, schema: HotelSchema },
      { name: Room.name, schema: RoomSchema },
      { name: HotelBooking.name, schema: HotelBookingSchema },
    ]),
    ReviewsModule,
  ],
  controllers: [HotelsController],
  providers: [HotelsService],
  exports: [HotelsService],
})
export class HotelsModule {}
