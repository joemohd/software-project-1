import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { LOCAL_TIME_FORMAT } from './flights.constants.js';

/**
 * FLT-03: converts an airport's local wall-clock time ("2026-12-01T14:30") to a UTC Date.
 * Rejects impossible dates (e.g. Feb 30) and times skipped by a daylight-saving change.
 */
export function localToUtc(localTime: string, timeZone: string, label: string): Date {
  const local = DateTime.fromISO(localTime, { zone: timeZone });
  if (!local.isValid) {
    throw new BadRequestException(`${label} "${localTime}" is not a valid date and time.`);
  }
  // Luxon moves a time inside a DST gap forward; if the clock reading changed, that local time never happens
  if (local.toFormat(LOCAL_TIME_FORMAT) !== localTime) {
    throw new BadRequestException(`${label} "${localTime}" does not exist in ${timeZone} (daylight-saving change).`);
  }
  return local.toUTC().toJSDate();
}

/** UTC Date -> local wall-clock time in the airport's zone, in the same format the API accepts. */
export function utcToLocal(utc: Date, timeZone: string): string {
  return DateTime.fromJSDate(utc, { zone: timeZone }).toFormat(LOCAL_TIME_FORMAT);
}

/** UTC bounds [start, end) of the local calendar day that contains `utc` in `timeZone` (23 or 25 hours on DST days). */
export function localDayBoundsUtc(utc: Date, timeZone: string): { start: Date; end: Date } {
  const start = DateTime.fromJSDate(utc, { zone: timeZone }).startOf('day');
  return { start: start.toUTC().toJSDate(), end: start.plus({ days: 1 }).toUTC().toJSDate() };
}
