import PDFDocument from 'pdfkit';
import type { BudgetSummaryDto, ItineraryDetailDto } from './dto/itinerary-response.dto.js';

// ITN-28: renders an itinerary (and its budget summary, when rates are available) as a PDF.
// Pure function of the API response objects, so it is easy to test without a database.

const CATEGORY_LABELS: Record<string, string> = {
  food: 'Food',
  accommodation: 'Accommodation',
  inCityTransport: 'In-city transport',
  activities: 'Activities',
  intercityTransport: 'Intercity transport',
};

const money = (amount: number, currency: string) =>
  `${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;

export function buildItineraryPdf(
  itinerary: ItineraryDetailDto,
  budget: BudgetSummaryDto | null,
  generatedAt: Date = new Date(),
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: { Title: itinerary.title, Author: itinerary.author.name },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const heading = (text: string) => {
      doc.moveDown(0.8).font('Helvetica-Bold').fontSize(14).fillColor('#1f2937').text(text);
      doc.moveDown(0.2).font('Helvetica').fontSize(10.5).fillColor('#111827');
    };
    const line = (text: string, options: { indent?: number; muted?: boolean } = {}) => {
      doc
        .font('Helvetica')
        .fontSize(10.5)
        .fillColor(options.muted ? '#6b7280' : '#111827')
        .text(text, { indent: options.indent ?? 0 });
    };

    // Title block
    doc.font('Helvetica-Bold').fontSize(20).fillColor('#111827').text(itinerary.title);
    doc.moveDown(0.3);
    const dates = itinerary.endDate ? `${itinerary.startDate} to ${itinerary.endDate}` : `Starts ${itinerary.startDate}`;
    line(`${dates}  ·  ${itinerary.dayCount} day(s)  ·  Countries: ${itinerary.countries.join(', ')}`);
    line(`By ${itinerary.author.name || 'unknown'}  ·  ${itinerary.visibility === 'public' ? 'Public' : 'Private'}`, { muted: true });
    if (itinerary.clonedFrom) {
      line(`Based on "${itinerary.clonedFrom.title}" by ${itinerary.clonedFrom.author.name}`, { muted: true });
    }

    // City groups (ITN-09)
    if (itinerary.cityGroups.length) {
      heading('Route');
      for (const group of itinerary.cityGroups) {
        line(`${group.city.name}: ${group.startDate} to ${group.endDate} (${group.dayCount} day${group.dayCount === 1 ? '' : 's'})`);
      }
    }

    // Day by day
    heading('Day by day');
    if (!itinerary.days.length) line('No days added yet.', { muted: true });
    for (const day of itinerary.days) {
      doc.moveDown(0.4).font('Helvetica-Bold').fontSize(11.5).fillColor('#111827').text(`Day ${day.dayNumber}  ·  ${day.date}  ·  ${day.city.name}`);
      if (day.notes) line(day.notes, { indent: 12, muted: true });
      for (const activity of day.activities) {
        const cost = activity.cost !== null && activity.currency ? `  (${money(activity.cost, activity.currency)})` : '';
        line(`${activity.time ? activity.time + '  ' : ''}${activity.name}${cost}`, { indent: 12 });
        if (activity.description) line(activity.description, { indent: 24, muted: true });
      }
      for (const entry of day.budgets) {
        line(`Budget, ${CATEGORY_LABELS[entry.category] ?? entry.category}: ${money(entry.amount, entry.currency)}${entry.note ? ` (${entry.note})` : ''}`, { indent: 12 });
      }
      for (const booking of day.bookings ?? []) {
        const label = booking.type === 'flight' ? 'Flight booking' : 'Hotel booking';
        line(`${label}: ${booking.name}${booking.reference ? ` [${booking.reference}]` : ''}  ${money(booking.amount, booking.currency)}`, { indent: 12 });
      }
      for (const cost of itinerary.transportCosts.filter((entry) => entry.dayId === day.id)) {
        line(`Transport (${cost.mode}): ${cost.fromCity.name} to ${cost.toCity.name}  ${money(cost.amount, cost.currency)}`, { indent: 12 });
      }
    }

    // Budget (ITN-14, ITN-18, ITN-27)
    heading('Budget');
    if (!budget) {
      line('Exchange rates were unavailable, so the converted budget could not be included.', { muted: true });
    } else {
      for (const [category, label] of Object.entries(CATEGORY_LABELS)) {
        line(`${label}: ${money(budget.byCategory[category as keyof typeof budget.byCategory], budget.currency)}`);
      }
      doc.font('Helvetica-Bold').text(`Total: ${money(budget.total, budget.currency)}`);
      line(`Exchange rates of ${new Date(budget.rateDate).toISOString().slice(0, 10)}${budget.rateSource === 'cached' ? ' (cached)' : ''}`, { muted: true });
      if (budget.bookings.total > 0) {
        line(`Linked bookings: ${money(budget.bookings.total, budget.bookings.currency)} (platform currency, not converted)`);
      }
    }

    doc.moveDown(1.5);
    line(`Generated ${generatedAt.toISOString().slice(0, 16).replace('T', ' ')} UTC`, { muted: true });
    doc.end();
  });
}

/** A safe download file name from the itinerary title. */
export function pdfFileName(title: string): string {
  const slug = title
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60)
    .toLowerCase();
  return `${slug || 'itinerary'}.pdf`;
}
