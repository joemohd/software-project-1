// Pure refund rules (FLT-09, HTL-10, FLT-26, HTL-21, PAY-03): no database access, so they are unit-tested directly.

const DAY_MS = 24 * 60 * 60 * 1000;

export type RefundTier = { daysBeforeService: { startDay: number; endDay?: number | null }; refundPercentage: number };

/** Whole days left before the service starts (departure or check-in); 0 on the last day. */
export function daysBeforeService(serviceStart: Date, now: Date = new Date()): number {
  return Math.max(0, Math.floor((serviceStart.getTime() - now.getTime()) / DAY_MS));
}

/**
 * FLT-09/HTL-10: the refund uses the tier with the highest days-before threshold that does not exceed the days left.
 * No tier applies → 0%.
 */
export function refundPercentage(tiers: RefundTier[], daysLeft: number): number {
  let best: RefundTier | undefined;
  for (const tier of tiers) {
    if (tier.daysBeforeService.startDay <= daysLeft && (!best || tier.daysBeforeService.startDay > best.daysBeforeService.startDay)) {
      best = tier;
    }
  }
  return best?.refundPercentage ?? 0;
}

/** Refund in integer cents, rounded down so we never refund more than the tier allows. */
export function refundAmount(totalPaid: number, percentage: number): number {
  return Math.floor((totalPaid * percentage) / 100);
}

/** PAY-03: Stripe refund status as shown to the user. */
export function refundDisplayStatus(status: string | null): 'Pending' | 'Refunded' | 'Failed' {
  if (status === 'succeeded') return 'Refunded';
  if (status === 'failed' || status === 'canceled') return 'Failed';
  return 'Pending';
}
