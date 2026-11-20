// Pure itinerary rules (no database), kept separate so they are easy to unit test.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Normalises a date to midnight UTC so day arithmetic never drifts with time zones. */
export function toUtcMidnight(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

/** ITN-05: date of the day with this 1-based number = start date + (number - 1) days. */
export function dayDate(startDate: Date, dayNumber: number): Date {
  return new Date(toUtcMidnight(startDate).getTime() + (dayNumber - 1) * DAY_MS);
}

/** "YYYY-MM-DD" in UTC. */
export function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(toUtcMidnight(date).getTime() + days * DAY_MS);
}

/**
 * ITN-08: moves the item at `from` (0-based) to `to` (0-based) and returns a new array.
 * Day numbers are the array positions, so renumbering follows automatically.
 */
export function moveItem<T>(items: readonly T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) {
    throw new RangeError('Position out of range.');
  }
  const copy = [...items];
  const [moved] = copy.splice(from, 1);
  copy.splice(to, 0, moved);
  return copy;
}

export interface CityGroup {
  index: number; // 0-based group number, used by ITN-25
  cityId: string;
  firstDayNumber: number;
  lastDayNumber: number;
  dayCount: number;
  startDate: string;
  endDate: string;
}

/** ITN-09: consecutive days in the same city form one group. */
export function cityGroups(startDate: Date, cityIds: readonly string[]): CityGroup[] {
  const groups: CityGroup[] = [];
  cityIds.forEach((cityId, position) => {
    const dayNumber = position + 1;
    const last = groups[groups.length - 1];
    if (last && last.cityId === cityId) {
      last.lastDayNumber = dayNumber;
      last.dayCount += 1;
      last.endDate = isoDate(dayDate(startDate, dayNumber));
    } else {
      groups.push({
        index: groups.length,
        cityId,
        firstDayNumber: dayNumber,
        lastDayNumber: dayNumber,
        dayCount: 1,
        startDate: isoDate(dayDate(startDate, dayNumber)),
        endDate: isoDate(dayDate(startDate, dayNumber)),
      });
    }
  });
  return groups;
}

/** Rounds money to 2 decimals for display. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * ITN-18: converts through the base currency of the cached rates.
 * `rates[X]` is how many X one unit of the base buys (the base itself is 1).
 */
export function convertAmount(
  amount: number,
  from: string,
  to: string,
  rates: Readonly<Record<string, number>>,
  base: string,
): number {
  if (from === to) return amount;
  const fromRate = from === base ? 1 : rates[from];
  const toRate = to === base ? 1 : rates[to];
  if (!fromRate || !toRate) {
    throw new MissingRateError(!fromRate ? from : to);
  }
  return (amount / fromRate) * toRate;
}

export class MissingRateError extends Error {
  constructor(public readonly currency: string) {
    super(`No exchange rate available for ${currency}.`);
  }
}

// ---- ITN-14: budget aggregation ----

export type SummaryCategory =
  | 'food'
  | 'accommodation'
  | 'inCityTransport'
  | 'activities'
  | 'intercityTransport';

export const SUMMARY_CATEGORIES: SummaryCategory[] = [
  'food',
  'accommodation',
  'inCityTransport',
  'activities',
  'intercityTransport',
];

export interface MoneyLine {
  dayIndex: number; // 0-based position of the day
  category: SummaryCategory;
  amount: number;
  currency: string;
}

export type CategoryTotals = Record<SummaryCategory, number>;

export function emptyTotals(): CategoryTotals {
  return { food: 0, accommodation: 0, inCityTransport: 0, activities: 0, intercityTransport: 0 };
}

export interface BudgetBreakdown {
  byCategory: CategoryTotals;
  byDay: { dayIndex: number; byCategory: CategoryTotals; total: number }[];
  total: number;
}

/**
 * ITN-14: sums every line, converted to the target currency, by category and by day.
 * Budget entries, activity costs (as "activities") and intercity transport all count.
 */
export function aggregateBudget(
  dayCount: number,
  lines: readonly MoneyLine[],
  convert: (amount: number, currency: string) => number,
): BudgetBreakdown {
  const byCategory = emptyTotals();
  const byDay = Array.from({ length: dayCount }, (_, dayIndex) => ({
    dayIndex,
    byCategory: emptyTotals(),
    total: 0,
  }));

  for (const line of lines) {
    const value = convert(line.amount, line.currency);
    byCategory[line.category] += value;
    const day = byDay[line.dayIndex];
    if (day) {
      day.byCategory[line.category] += value;
      day.total += value;
    }
  }

  const round = (totals: CategoryTotals): CategoryTotals =>
    Object.fromEntries(
      SUMMARY_CATEGORIES.map((category) => [category, roundMoney(totals[category])]),
    ) as CategoryTotals;

  const total = SUMMARY_CATEGORIES.reduce((sum, category) => sum + byCategory[category], 0);
  return {
    byCategory: round(byCategory),
    byDay: byDay.map((day) => ({ ...day, byCategory: round(day.byCategory), total: roundMoney(day.total) })),
    total: roundMoney(total),
  };
}
