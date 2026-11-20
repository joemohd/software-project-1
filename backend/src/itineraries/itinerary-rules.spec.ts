import { describe, expect, it } from 'vitest';
import {
  aggregateBudget,
  cityGroups,
  convertAmount,
  dayDate,
  isoDate,
  MissingRateError,
  moveItem,
} from './itinerary-rules.js';

describe('itinerary rules', () => {
  const start = new Date('2026-12-30T15:45:00Z');

  it('derives day dates from the start date, across month and year ends (ITN-05)', () => {
    expect(isoDate(dayDate(start, 1))).toBe('2026-12-30');
    expect(isoDate(dayDate(start, 3))).toBe('2027-01-01');
  });

  it('moves a day and keeps the others in order (ITN-08)', () => {
    expect(moveItem(['a', 'b', 'c', 'd'], 0, 2)).toEqual(['b', 'c', 'a', 'd']);
    expect(moveItem(['a', 'b', 'c', 'd'], 3, 0)).toEqual(['d', 'a', 'b', 'c']);
    expect(() => moveItem(['a'], 0, 1)).toThrow(RangeError);
  });

  it('groups consecutive days in the same city only (ITN-09)', () => {
    const groups = cityGroups(start, ['cai', 'cai', 'dxb', 'cai']);
    expect(groups.map((g) => [g.cityId, g.dayCount, g.firstDayNumber, g.lastDayNumber])).toEqual([
      ['cai', 2, 1, 2],
      ['dxb', 1, 3, 3],
      ['cai', 1, 4, 4],
    ]);
    expect(groups[0]).toMatchObject({ startDate: '2026-12-30', endDate: '2026-12-31' });
    expect(cityGroups(start, [])).toEqual([]);
  });

  it('converts through the base currency (ITN-18)', () => {
    const rates = { EUR: 0.5, EGP: 50 };
    expect(convertAmount(10, 'USD', 'EGP', rates, 'USD')).toBe(500);
    expect(convertAmount(10, 'EUR', 'USD', rates, 'USD')).toBe(20);
    expect(convertAmount(10, 'EUR', 'EGP', rates, 'USD')).toBe(1000);
    expect(convertAmount(10, 'EGP', 'EGP', {}, 'USD')).toBe(10);
    expect(() => convertAmount(1, 'XXX', 'USD', rates, 'USD')).toThrow(MissingRateError);
  });

  it('totals by category and by day, counting activities and intercity transport (ITN-14)', () => {
    const result = aggregateBudget(
      2,
      [
        { dayIndex: 0, category: 'food', amount: 10, currency: 'USD' },
        { dayIndex: 0, category: 'activities', amount: 5, currency: 'USD' },
        { dayIndex: 1, category: 'intercityTransport', amount: 20, currency: 'EUR' },
      ],
      (amount, currency) => (currency === 'EUR' ? amount * 2 : amount),
    );
    expect(result.byCategory).toEqual({
      food: 10,
      accommodation: 0,
      inCityTransport: 0,
      activities: 5,
      intercityTransport: 40,
    });
    expect(result.byDay.map((day) => day.total)).toEqual([15, 40]);
    expect(result.total).toBe(55);
  });
});
