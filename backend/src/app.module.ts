import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './common/auth/auth.module.js';
import { HotelsModule } from './hotels/hotels.module.js';
import { HotelBookingsModule } from './hotel-bookings/hotel-bookings.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';

/**
 * SUGGESTED app.module.ts — MERGE with your team's version rather than
 * overwriting it. The only additions needed for the hotel endpoints are:
 *   - ConfigModule.forRoot({ isGlobal: true })        (once, shared)
 *   - MongooseModule.forRootAsync(...)                (once, shared)
 *   - AuthModule                                      (shared foundation)
 *   - HotelsModule, HotelBookingsModule, ReviewsModule
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    MongooseModule.forRootAsync({
      useFactory: () => ({
        uri: process.env.MONGODB_URI,
      }),
    }),
    AuthModule,
    HotelsModule,
    HotelBookingsModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
