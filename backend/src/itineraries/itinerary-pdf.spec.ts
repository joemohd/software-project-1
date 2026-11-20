import { describe, expect, it } from 'vitest';
import type { BudgetSummaryDto, ItineraryDetailDto } from './dto/itinerary-response.dto.js';
import { buildItineraryPdf, pdfFileName } from './itinerary-pdf.js';

const city = { id: 'c1', name: 'Cairo' };
const itinerary = {
  id: 'i1', title: 'Two weeks in Egypt', countries: ['EG'], startDate: '2026-12-20', endDate: '2026-12-21',
  visibility: 'private', dayCount: 2, author: { id: 'u1', name: 'Ahmed' }, clonedFrom: null,
  days: [
    { id: 'd1', dayNumber: 1, date: '2026-12-20', city, notes: 'Arrive', bookings: [],
      activities: [{ id: 'a1', name: 'Museum', description: '', time: '10:00', cost: 20, currency: 'USD', images: [] }],
      budgets: [{ id: 'b1', category: 'food', amount: 500, currency: 'EGP', note: '' }] },
    { id: 'd2', dayNumber: 2, date: '2026-12-21', city, notes: '', activities: [], budgets: [],
      bookings: [{ id: 'k1', type: 'hotel', name: 'Nile Hotel', reference: null, status: 'confirmed', amount: 120, currency: 'USD', checkIn: '2026-12-21', nights: 1 }] },
  ],
  transportCosts: [], cityGroups: [{ index: 0, city, firstDayNumber: 1, lastDayNumber: 2, dayCount: 2, startDate: '2026-12-20', endDate: '2026-12-21' }],
  createdAt: new Date(), updatedAt: new Date(),
} as unknown as ItineraryDetailDto;

describe('itinerary PDF (ITN-28)', () => {
  it('produces a PDF document', async () => {
    const pdf = await buildItineraryPdf(itinerary, null);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(1000);
  });

  it('includes the budget when available', async () => {
    const budget = {
      currency: 'EGP', rateDate: new Date(), rateSource: 'live', total: 1500, byDay: [], byCityGroup: [],
      byCategory: { food: 500, accommodation: 0, inCityTransport: 0, activities: 1000, intercityTransport: 0 },
      bookings: { currency: 'USD', flights: 0, hotels: 120, total: 120, byDay: [] },
    } as unknown as BudgetSummaryDto;
    const pdf = await buildItineraryPdf(itinerary, budget);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('makes a safe file name', () => {
    expect(pdfFileName('Two weeks in Egypt! / 2026')).toBe('two-weeks-in-egypt-2026.pdf');
    expect(pdfFileName('***')).toBe('itinerary.pdf');
  });
});
