import { HttpException, Injectable, StreamableFile } from '@nestjs/common';
import { BudgetSummaryService } from './budget-summary.service.js';
import type { BudgetSummaryDto } from './dto/itinerary-response.dto.js';
import { ItinerariesService } from './itineraries.service.js';
import { buildItineraryPdf, pdfFileName } from './itinerary-pdf.js';
import { ItineraryPresenter } from './itinerary-presenter.service.js';

/** ITN-28: export one of the user's itineraries as a downloadable / printable PDF. */
@Injectable()
export class ItineraryPdfService {
  constructor(
    private readonly itineraries: ItinerariesService,
    private readonly presenter: ItineraryPresenter,
    private readonly budgetSummary: BudgetSummaryService,
  ) {}

  async export(userId: string, itineraryId: string): Promise<StreamableFile> {
    const itinerary = await this.itineraries.findOwned(userId, itineraryId);
    const detail = await this.presenter.detail(itinerary);

    // The PDF is still produced when exchange rates are unavailable; it then says so instead of a total
    let budget: BudgetSummaryDto | null = null;
    try {
      budget = await this.budgetSummary.summarize(
        itinerary,
        await this.budgetSummary.resolveCurrency(undefined, userId),
      );
    } catch (error) {
      if (!(error instanceof HttpException)) throw error;
    }

    const pdf = await buildItineraryPdf(detail, budget);
    return new StreamableFile(pdf, {
      type: 'application/pdf',
      disposition: `attachment; filename="${pdfFileName(detail.title)}"`,
      length: pdf.length,
    });
  }
}
