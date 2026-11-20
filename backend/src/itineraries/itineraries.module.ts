import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { FlightsModule } from '../flights/flights.module.js';
import { ItinerariesController } from './itineraries.controller.js';
import { ItinerariesService } from './itineraries.service.js';

@Module({
  imports: [DatabaseModule, FlightsModule],
  controllers: [ItinerariesController],
  providers: [ItinerariesService],
  exports: [ItinerariesService],
})
export class ItinerariesModule {}
