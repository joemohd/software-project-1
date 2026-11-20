import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { HOLD_SWEEP_INTERVAL_MS } from './flight-bookings.constants.js';
import { FlightBookingsService } from './flight-bookings.service.js';

/**
 * FLT-19/FLT-21: every minute, expires Pending Payment bookings whose 10-minute hold ran out and releases their seats.
 * Holds are also expired lazily before creating and listing bookings, so this only bounds how long a seat stays held.
 */
@Injectable()
export class HoldExpirySweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HoldExpirySweeper.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly flightBookingsService: FlightBookingsService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), HOLD_SWEEP_INTERVAL_MS);
    // Don't keep the process alive just for this timer
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    clearInterval(this.timer);
  }

  /** One run; skipped if the previous run is still going. Errors are logged, and the next run tries again. */
  async sweep(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const expired = await this.flightBookingsService.expireOverdueHolds();
      if (expired) this.logger.log(`Expired ${expired} flight booking hold(s).`);
      return expired;
    } catch (error) {
      this.logger.error('Flight booking hold sweep failed', error instanceof Error ? error.stack : String(error));
      return 0;
    } finally {
      this.running = false;
    }
  }
}
