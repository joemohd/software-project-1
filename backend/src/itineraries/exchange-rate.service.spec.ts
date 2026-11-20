import { ServiceUnavailableException } from '@nestjs/common';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ExchangeRateService } from './exchange-rate.service.js';

// A tiny stand-in for the Mongoose model: findOne(...).sort(...).lean().exec() and updateOne(...).exec()
function fakeModel(today: unknown, latest: unknown) {
  const updateOne = vi.fn(() => ({ exec: () => Promise.resolve({}) }));
  const findOne = vi.fn((filter: { fetchedOn?: string }) => {
    const result = filter.fetchedOn ? today : latest;
    const query = {
      sort: () => query,
      lean: () => query,
      exec: () => Promise.resolve(result),
    };
    return query;
  });
  return { findOne, updateOne };
}

const config = { get: vi.fn(() => undefined) };
const now = new Date('2026-11-20T12:00:00Z');

describe('ExchangeRateService (ITN-18)', () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses today's cached rates without calling the API", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const model = fakeModel(
      { base: 'USD', fetchedOn: '2026-11-20', rateDate: now, rates: { EGP: 50 } },
      null,
    );
    const service = new ExchangeRateService(model as never, config as never);

    const table = await service.getRates(now);
    expect(table).toMatchObject({ source: 'live', rates: { EGP: 50 } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fetches once per day and stores the rates', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, date: '2026-11-20T00:00:00Z', rates: { EGP: 49.5, bad: 'x' } }),
        }),
      ),
    );
    const model = fakeModel(null, null);
    const service = new ExchangeRateService(model as never, config as never);

    const table = await service.getRates(now);
    expect(table.source).toBe('live');
    expect(table.rates).toEqual({ EGP: 49.5, USD: 1 });
    expect(model.updateOne).toHaveBeenCalledOnce();
  });

  it('falls back to the last cached rates when the API fails', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error('network down'))));
    const cachedDate = new Date('2026-11-18T00:00:00Z');
    const model = fakeModel(null, { base: 'USD', fetchedOn: '2026-11-18', rateDate: cachedDate, rates: { EUR: 0.9 } });
    const service = new ExchangeRateService(model as never, config as never);

    const table = await service.getRates(now);
    expect(table).toMatchObject({ source: 'cached', rateDate: cachedDate, rates: { EUR: 0.9 } });
  });

  it('answers 503 when the API fails and nothing is cached', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: false, status: 500 })));
    const service = new ExchangeRateService(fakeModel(null, null) as never, config as never);
    await expect(service.getRates(now)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
