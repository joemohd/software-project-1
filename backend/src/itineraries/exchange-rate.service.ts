import { Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  FX_BASE_CURRENCY,
  FX_DEFAULT_API_URL,
  FX_REQUEST_TIMEOUT_MS,
} from './itineraries.constants.js';
import { isoDate } from './itinerary-rules.js';
import { ExchangeRate } from './schemas/exchange-rate.schema.js';

export interface RateTable {
  base: string;
  rates: Record<string, number>;
  rateDate: Date;
  // 'live': today's rates; 'cached': the API failed, so the last cached rates were used
  source: 'live' | 'cached';
}

type ExchangeRateRecord = {
  base: string;
  fetchedOn: string;
  rateDate: Date;
  rates: Record<string, number>;
};

/**
 * ITN-18: exchange rates from FXRatesAPI, fetched by the backend at most once per day and
 * cached in MongoDB. If the API is unavailable the last cached rates are used.
 * The API key (FXRATES_API_KEY) is read from the environment and never sent to the client.
 */
@Injectable()
export class ExchangeRateService {
  private readonly logger = new Logger(ExchangeRateService.name);

  constructor(
    @InjectModel(ExchangeRate.name) private readonly rateModel: Model<ExchangeRate>,
    private readonly config: ConfigService,
  ) {}

  async getRates(now: Date = new Date()): Promise<RateTable> {
    const today = isoDate(now);
    const cachedToday = await this.rateModel
      .findOne({ base: FX_BASE_CURRENCY, fetchedOn: today })
      .lean<ExchangeRateRecord>()
      .exec();
    if (cachedToday) return this.toTable(cachedToday, 'live');

    try {
      const fetched = await this.fetchFromApi();
      await this.rateModel
        .updateOne(
          { base: FX_BASE_CURRENCY, fetchedOn: today },
          { $set: { rateDate: fetched.rateDate, rates: fetched.rates } },
          { upsert: true },
        )
        .exec()
        .catch((error: unknown) => {
          // Two requests fetched at the same moment: the other one already stored today's rates
          if ((error as { code?: number }).code !== 11000) throw error;
        });
      return { base: FX_BASE_CURRENCY, ...fetched, source: 'live' };
    } catch (error) {
      this.logger.warn(`FXRatesAPI request failed, using cached rates: ${(error as Error).message}`);
      const latest = await this.rateModel
        .findOne({ base: FX_BASE_CURRENCY })
        .sort({ fetchedOn: -1 })
        .lean<ExchangeRateRecord>()
        .exec();
      if (!latest) {
        throw new ServiceUnavailableException(
          'Exchange rates are currently unavailable and no cached rates exist yet. Try again later.',
        );
      }
      return this.toTable(latest, 'cached');
    }
  }

  private async fetchFromApi(): Promise<{ rates: Record<string, number>; rateDate: Date }> {
    const url = new URL(this.config.get<string>('FXRATES_API_URL') || FX_DEFAULT_API_URL);
    // USD is the provider's default base, so no paid base switching is needed
    const apiKey = this.config.get<string>('FXRATES_API_KEY');

    const response = await fetch(url, {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(FX_REQUEST_TIMEOUT_MS),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const body = (await response.json()) as {
      success?: boolean;
      base?: string;
      date?: string;
      timestamp?: number;
      rates?: Record<string, unknown>;
    };
    if (body.success === false || !body.rates || typeof body.rates !== 'object') {
      throw new Error('Unexpected response from FXRatesAPI');
    }

    const raw: Record<string, number> = {};
    for (const [code, value] of Object.entries(body.rates)) {
      if (/^[A-Z]{3}$/.test(code) && typeof value === 'number' && value > 0) raw[code] = value;
    }
    // Re-base to USD if the provider answered with another base
    const providerBase = (body.base ?? FX_BASE_CURRENCY).toUpperCase();
    raw[providerBase] = 1;
    const usdRate = raw[FX_BASE_CURRENCY];
    if (!usdRate) throw new Error('FXRatesAPI response has no USD rate');
    const rates = Object.fromEntries(
      Object.entries(raw).map(([code, value]) => [code, value / usdRate]),
    );

    const rateDate = body.date
      ? new Date(body.date)
      : body.timestamp
        ? new Date(body.timestamp * 1000)
        : new Date();
    return { rates, rateDate: Number.isNaN(rateDate.getTime()) ? new Date() : rateDate };
  }

  private toTable(record: ExchangeRateRecord, source: RateTable['source']): RateTable {
    // .lean() returns a Map field as a plain object
    const rates =
      record.rates instanceof Map
        ? Object.fromEntries(record.rates as Map<string, number>)
        : { ...record.rates };
    return { base: record.base, rates, rateDate: record.rateDate, source };
  }
}
