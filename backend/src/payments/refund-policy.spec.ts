import { daysBeforeService, refundAmount, refundDisplayStatus, refundPercentage } from './refund-policy.js';

describe('refund policy (FLT-09, HTL-10, PAY-03)', () => {
  const tiers = [
    { daysBeforeService: { startDay: 0, endDay: 7 }, refundPercentage: 0 },
    { daysBeforeService: { startDay: 7, endDay: 30 }, refundPercentage: 50 },
    { daysBeforeService: { startDay: 30, endDay: null }, refundPercentage: 100 },
  ];

  it.each([
    [0, 0],
    [6, 0],
    [7, 50],
    [29, 50],
    [30, 100],
    [365, 100],
  ])('%i days left → %i%%', (days, percent) => {
    expect(refundPercentage(tiers, days)).toBe(percent);
  });

  it('gives 0% when no tier applies', () => {
    expect(refundPercentage([], 10)).toBe(0);
    expect(refundPercentage([{ daysBeforeService: { startDay: 14 }, refundPercentage: 80 }], 3)).toBe(0);
  });

  it('counts whole days left, never negative', () => {
    const now = new Date('2026-11-20T12:00:00Z');
    expect(daysBeforeService(new Date('2026-11-27T11:59:59Z'), now)).toBe(6);
    expect(daysBeforeService(new Date('2026-11-27T12:00:00Z'), now)).toBe(7);
    expect(daysBeforeService(new Date('2026-11-19T12:00:00Z'), now)).toBe(0);
  });

  it('rounds the refund down to whole cents', () => {
    expect(refundAmount(99_999, 50)).toBe(49_999);
    expect(refundAmount(10_000, 100)).toBe(10_000);
    expect(refundAmount(10_000, 0)).toBe(0);
  });

  it.each([
    ['pending', 'Pending'],
    ['requires_action', 'Pending'],
    [null, 'Pending'],
    ['succeeded', 'Refunded'],
    ['failed', 'Failed'],
    ['canceled', 'Failed'],
  ])('shows Stripe status %s as %s', (status, shown) => {
    expect(refundDisplayStatus(status)).toBe(shown);
  });
});
