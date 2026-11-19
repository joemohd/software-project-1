/**
 * Date helpers for hotel availability. Hotel stays are date-only (no time of
 * day), so we normalise everything to UTC midnight and treat ranges as
 * half-open [start, end): a check-out day is free for the next guest.
 */

/** Strip the time component, returning UTC midnight of the given date. */
export function toUtcMidnight(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()),
  );
}

/** UTC midnight of today. */
export function todayUtcMidnight(): Date {
  return toUtcMidnight(new Date());
}

/** Whole nights between two date-only values (checkOut − checkIn). */
export function nightsBetween(checkIn: Date, checkOut: Date): number {
  const ms = toUtcMidnight(checkOut).getTime() - toUtcMidnight(checkIn).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Whole days from `from` until `to` (to − from), can be negative. */
export function daysBetween(from: Date, to: Date): number {
  const ms = toUtcMidnight(to).getTime() - toUtcMidnight(from).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/**
 * Do two half-open ranges [aStart, aEnd) and [bStart, bEnd) overlap?
 * Adjacent ranges (one ends exactly when the other starts) do NOT overlap.
 */
export function rangesOverlap(
  aStart: Date,
  aEnd: Date,
  bStart: Date,
  bEnd: Date,
): boolean {
  return aStart.getTime() < bEnd.getTime() && aEnd.getTime() > bStart.getTime();
}

/** Is [innerStart, innerEnd) fully contained within [outerStart, outerEnd)? */
export function rangeContains(
  outerStart: Date,
  outerEnd: Date,
  innerStart: Date,
  innerEnd: Date,
): boolean {
  return (
    outerStart.getTime() <= innerStart.getTime() &&
    outerEnd.getTime() >= innerEnd.getTime()
  );
}
