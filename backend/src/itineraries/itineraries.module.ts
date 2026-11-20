import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { UploadModule } from '../common/upload/upload.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { BudgetSummaryService } from './budget-summary.service.js';
import { ExchangeRateService } from './exchange-rate.service.js';
import { ItinerariesController } from './itineraries.controller.js';
import { ItinerariesService } from './itineraries.service.js';
import {
  ActivitiesController,
  BudgetsController,
  TransportCostsController,
} from './itinerary-items.controller.js';
import { ItineraryPresenter } from './itinerary-presenter.service.js';
import { ItinerarySearchService } from './itinerary-search.service.js';
import { PublicItinerariesService } from './public-itineraries.service.js';
import { ExchangeRate, ExchangeRateSchema } from './schemas/exchange-rate.schema.js';

// Itineraries, budgets and currency conversion: ITN-01, ITN-03, ITN-05, ITN-07 to ITN-10,
// ITN-12, ITN-14, ITN-16, ITN-18, ITN-20, ITN-21, ITN-25, ITN-26
@Module({
  imports: [
    DatabaseModule,
    UploadModule,
    MongooseModule.forFeature([{ name: ExchangeRate.name, schema: ExchangeRateSchema }]),
  ],
  controllers: [
    ItinerariesController,
    ActivitiesController,
    BudgetsController,
    TransportCostsController,
  ],
  providers: [
    ItinerariesService,
    PublicItinerariesService,
    BudgetSummaryService,
    ExchangeRateService,
    ItineraryPresenter,
    ItinerarySearchService,
  ],
  exports: [ExchangeRateService],
})
export class ItinerariesModule {}
