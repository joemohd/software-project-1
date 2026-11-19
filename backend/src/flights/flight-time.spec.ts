import { BadRequestException } from '@nestjs/common';
import { localDayBoundsUtc, localToUtc, utcToLocal } from './flight-time.js';

describe('flight time conversion (FLT-03)', () => {
  it('converts local airport time to UTC and back', () => {
    const cairo = localToUtc('2026-12-01T10:00', 'Africa/Cairo', 'Departure time');
    const newYork = localToUtc('2026-12-01T14:30', 'America/New_York', 'Arrival time');

    expect(cairo.toISOString()).toBe('2026-12-01T08:00:00.000Z'); // UTC+2
    expect(newYork.toISOString()).toBe('2026-12-01T19:30:00.000Z'); // UTC-5 in winter
    expect(utcToLocal(newYork, 'America/New_York')).toBe('2026-12-01T14:30');
  });

  it('rejects an impossible date', () => {
    expect(() => localToUtc('2026-02-30T10:00', 'Africa/Cairo', 'Departure time')).toThrow(BadRequestException);
  });

  it('rejects a local time skipped by daylight saving (New York, 14 Mar 2027 02:30)', () => {
    expect(() => localToUtc('2027-03-14T02:30', 'America/New_York', 'Departure time')).toThrow(/daylight-saving/);
  });

  it('accepts a repeated fall-back time (Luxon resolves it to the second occurrence, EST UTC-5)', () => {
    expect(localToUtc('2026-11-01T01:30', 'America/New_York', 'Departure time').toISOString()).toBe(
      '2026-11-01T06:30:00.000Z',
    );
  });

  it('gives the UTC bounds of the local day, including 23-hour DST days', () => {
    const cairoDay = localDayBoundsUtc(new Date('2026-11-30T22:30:00Z'), 'Africa/Cairo'); // 00:30 on 1 Dec in Cairo
    expect([cairoDay.start.toISOString(), cairoDay.end.toISOString()]).toEqual([
      '2026-11-30T22:00:00.000Z',
      '2026-12-01T22:00:00.000Z',
    ]);

    const springForward = localDayBoundsUtc(new Date('2027-03-14T15:00:00Z'), 'America/New_York');
    expect(springForward.end.getTime() - springForward.start.getTime()).toBe(23 * 60 * 60 * 1000);
  });
});
