import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { FlightBookingsModule } from '../flight-bookings/flight-bookings.module.js';
import { AirlinesController } from './airlines.controller.js';
import { AirlinesService } from './airlines.service.js';
import { AirportsController } from './airports.controller.js';
import { AirportsService } from './airports.service.js';
import { FlightManifestService } from './flight-manifest.service.js';
import { FlightSearchController } from './flight-search.controller.js';
import { FlightSearchService } from './flight-search.service.js';
import { FlightsController } from './flights.controller.js';
import { FlightsService } from './flights.service.js';

// Airports, airlines' flight policies, flights, cabins and search (FLT-02 to FLT-09, FLT-11, FLT-12, FLT-15, FLT-29).
// Flight bookings are imported here so app.module.ts doesn't need to change.
@Module({
  imports: [DatabaseModule, FlightBookingsModule],
  controllers: [AirportsController, AirlinesController, FlightSearchController, FlightsController],
  providers: [AirportsService, AirlinesService, FlightsService, FlightManifestService, FlightSearchService],
  exports: [FlightSearchService, FlightsService],
})
export class FlightsModule {}
