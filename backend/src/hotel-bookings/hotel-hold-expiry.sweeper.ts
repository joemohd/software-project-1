import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { HOTEL_HOLD_SWEEP_INTERVAL_MS } from './hotel-booking.constants.js';
import { HotelBookingService } from './hotel-booking.service.js';

/**
 * HTL-18: every minute, expires Pending Payment bookings whose 10-minute hold ran out, which releases their rooms.
 * Holds are also expired lazily before booking, so this only bounds how long a room stays held.
 */
@Injectable()
export class HotelHoldExpirySweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(HotelHoldExpirySweeper.name);
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private readonly hotelBookingService: HotelBookingService) {}

  onApplicationBootstrap(): void {
    this.timer = setInterval(() => void this.sweep(), HOTEL_HOLD_SWEEP_INTERVAL_MS);
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
      const expired = await this.hotelBookingService.expireOverdueHolds();
      if (expired) this.logger.log(`Expired ${expired} hotel booking hold(s).`);
      return expired;
    } catch (error) {
      this.logger.error('Hotel booking hold sweep failed', error instanceof Error ? error.stack : String(error));
      return 0;
    } finally {
      this.running = false;
    }
  }
}
