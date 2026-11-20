import { BadGatewayException, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import Stripe from 'stripe';

// PAY-04: one platform currency for every price, payment and refund
export const PLATFORM_CURRENCY = 'usd';

/**
 * PAY-01, PAY-03: the one place that talks to Stripe. The client is created on first use, so teammates without a
 * STRIPE_SECRET_KEY can still start the app; only payment routes then answer 503.
 */
@Injectable()
export class StripeService {
  private readonly logger = new Logger(StripeService.name);
  private client?: Stripe;

  get stripe(): Stripe {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) throw new ServiceUnavailableException('Payments are not set up: STRIPE_SECRET_KEY is missing in .env.');
    this.client ??= new Stripe(key);
    return this.client;
  }

  /** PAY-01: the project must use Stripe test mode; test keys start with sk_test_. */
  get isTestMode(): boolean {
    return (process.env.STRIPE_SECRET_KEY ?? '').startsWith('sk_test_');
  }

  get webhookSecret(): string | undefined {
    return process.env.STRIPE_WEBHOOK_SECRET || undefined;
  }

  /** Runs a Stripe call and turns Stripe errors into a 502 with Stripe's message. */
  async call<T>(action: string, request: () => Promise<T>): Promise<T> {
    try {
      return await request();
    } catch (error) {
      if (error instanceof Stripe.errors.StripeError) {
        this.logger.warn(`Stripe ${action} failed: ${error.message}`);
        throw new BadGatewayException(`Stripe could not ${action}: ${error.message}`);
      }
      throw error;
    }
  }
}

/** Stripe fields that may be an id or an expanded object. */
export function stripeId(value: string | { id: string } | null | undefined): string | null {
  if (!value) return null;
  return typeof value === 'string' ? value : value.id;
}
