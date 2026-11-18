import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AirportsController } from './airports.controller.js';
import { AirportsService } from './airports.service.js';

// Airports, airlines' flight policies, flights and cabins (FLT-02 to FLT-09, FLT-29)
@Module({
  imports: [DatabaseModule],
  controllers: [AirportsController],
  providers: [AirportsService],
})
export class FlightsModule {}
