import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { FlightBookingsModule } from '../flight-bookings/flight-bookings.module.js';
import { AirlinesController } from './airlines.controller.js';
import { AirlinesService } from './airlines.service.js';
import { AirportsController } from './airports.controller.js';
import { AirportsService } from './airports.service.js';
import { FlightsController } from './flights.controller.js';
import { FlightsService } from './flights.service.js';

// Airports, airlines' flight policies, flights and cabins (FLT-02 to FLT-09, FLT-29).
// Flight bookings are imported here so app.module.ts doesn't need to change.
@Module({
  imports: [DatabaseModule, FlightBookingsModule],
  controllers: [AirportsController, AirlinesController, FlightsController],
  providers: [AirportsService, AirlinesService, FlightsService],
})
export class FlightsModule {}
