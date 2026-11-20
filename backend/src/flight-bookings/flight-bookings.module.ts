import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { FlightBookingsController } from './flight-bookings.controller.js';
import { FlightBookingsService } from './flight-bookings.service.js';
import { HoldExpirySweeper } from './hold-expiry.sweeper.js';

// Flight bookings: create with seat hold, hold expiry (FLT-19, FLT-21)
@Module({
  imports: [DatabaseModule],
  controllers: [FlightBookingsController],
  providers: [FlightBookingsService, HoldExpirySweeper],
  exports: [FlightBookingsService],
})
export class FlightBookingsModule {}
