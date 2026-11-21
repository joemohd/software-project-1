import { BadRequestException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CabinType, FlightStatus, SeatAvailability, SeatType } from '../database/schemas/flight.schema.js';
import { ProviderStatus } from '../database/schemas/provider.schema.js';
import { FlightSearchService } from './flight-search.service.js';

const chainQuery = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = {
    exec: vi.fn().mockResolvedValue(result),
  };
  for (const method of ['select', 'lean']) {
    q[method] = vi.fn().mockReturnValue(q);
  }
  return q;
};

describe('FlightSearchService (FLT-11, FLT-12, FLT-15)', () => {
  const NOW = new Date('2026-11-20T12:00:00Z');
  const cairoCityId = new Types.ObjectId();
  const londonCityId = new Types.ObjectId();
  const caiId = new Types.ObjectId();
  const lhrId = new Types.ObjectId();
  const airlineId = new Types.ObjectId();
  const outboundFlightId = new Types.ObjectId();
  const fasterOutboundId = new Types.ObjectId();
  const returnFlightId = new Types.ObjectId();

  let flightModel: Record<string, ReturnType<typeof vi.fn>>;
  let airlineModel: Record<string, ReturnType<typeof vi.fn>>;
  let airportModel: Record<string, ReturnType<typeof vi.fn>>;
  let cityModel: Record<string, ReturnType<typeof vi.fn>>;
  let flightBookingsService: { expireOverdueHolds: ReturnType<typeof vi.fn> };
  let service: FlightSearchService;

  const makeSeats = (available: number, booked = 0, held = 0) => [
    ...Array.from({ length: available }, (_, i) => ({
      row: 1,
      column: String.fromCharCode(65 + (i % 6)),
      type: SeatType.WINDOW,
      availability: SeatAvailability.AVAILABLE,
    })),
    ...Array.from({ length: booked }, (_, i) => ({
      row: 2,
      column: String.fromCharCode(65 + (i % 6)),
      type: SeatType.AISLE,
      availability: SeatAvailability.BOOKED,
    })),
    ...Array.from({ length: held }, (_, i) => ({
      row: 3,
      column: String.fromCharCode(65 + (i % 6)),
      type: SeatType.MIDDLE,
      availability: SeatAvailability.HELD,
    })),
  ];

  const outboundFlight = {
    _id: outboundFlightId,
    airlineId,
    number: '777',
    status: FlightStatus.SCHEDULED,
    departure: { airportId: caiId, timestamp: new Date('2026-12-01T08:00:00Z') }, // 10:00 Cairo
    arrival: { airportId: lhrId, timestamp: new Date('2026-12-01T13:30:00Z') }, // 330 min
    maxBagWeight: 32,
    cabins: [
      {
        name: CabinType.ECONOMY,
        seatPrice: 30000,
        freeBagWeight: 23,
        seats: makeSeats(3, 1, 1), // 3 available out of 5
      },
      {
        name: CabinType.BUSINESS,
        seatPrice: 90000,
        freeBagWeight: 32,
        seats: makeSeats(2, 0, 0),
      },
    ],
  };

  const fasterExpensiveFlight = {
    _id: fasterOutboundId,
    airlineId,
    number: '779',
    status: FlightStatus.SCHEDULED,
    departure: { airportId: caiId, timestamp: new Date('2026-12-01T12:00:00Z') }, // 14:00 Cairo
    arrival: { airportId: lhrId, timestamp: new Date('2026-12-01T16:45:00Z') }, // 285 min
    maxBagWeight: 32,
    cabins: [
      {
        name: CabinType.ECONOMY,
        seatPrice: 50000,
        freeBagWeight: 23,
        seats: makeSeats(4),
      },
    ],
  };

  const returnFlight = {
    _id: returnFlightId,
    airlineId,
    number: '778',
    status: FlightStatus.SCHEDULED,
    departure: { airportId: lhrId, timestamp: new Date('2026-12-05T15:00:00Z') },
    arrival: { airportId: caiId, timestamp: new Date('2026-12-05T20:00:00Z') },
    maxBagWeight: 32,
    cabins: [
      {
        name: CabinType.ECONOMY,
        seatPrice: 32000,
        freeBagWeight: 23,
        seats: makeSeats(5),
      },
    ],
  };

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });

    flightModel = {
      find: vi.fn((filter: Record<string, any>) => {
        const depAirportId = filter['departure.airportId']?.toString();
        if (depAirportId === caiId.toString()) {
          return chainQuery([outboundFlight, fasterExpensiveFlight]);
        }
        if (depAirportId === lhrId.toString()) {
          return chainQuery([returnFlight]);
        }
        return chainQuery([]);
      }),
    };
    airlineModel = {
      find: vi.fn(() =>
        chainQuery([
          {
            _id: airlineId,
            name: 'EgyptAir',
            iataCode: 'MS',
            logoUrl: 'https://example.com/ms.png',
            status: ProviderStatus.ACTIVE,
          },
        ]),
      ),
    };
    airportModel = {
      find: vi.fn(() =>
        chainQuery([
          { _id: caiId, iataCode: 'CAI', name: 'Cairo International', cityId: cairoCityId },
          { _id: lhrId, iataCode: 'LHR', name: 'Heathrow Airport', cityId: londonCityId },
        ]),
      ),
    };
    cityModel = {
      find: vi.fn(() =>
        chainQuery([
          { _id: cairoCityId, timeZone: 'Africa/Cairo' },
          { _id: londonCityId, timeZone: 'Europe/London' },
        ]),
      ),
    };
    flightBookingsService = {
      expireOverdueHolds: vi.fn().mockResolvedValue(undefined),
    };

    service = new FlightSearchService(
      flightModel as never,
      airlineModel as never,
      airportModel as never,
      cityModel as never,
      flightBookingsService as never,
    );
  });

  afterEach(() => vi.useRealTimers());

  it('searches one-way flights using departure airport local day bounds and calculates passenger fares (FLT-11, FLT-12)', async () => {
    // 2 adults, 1 child (3 seats required), 1 infant (0 seats, 10% fare)
    const res = await service.search({
      departureAirportId: caiId.toString(),
      arrivalAirportId: lhrId.toString(),
      departureDate: '2026-12-01',
      adults: 2,
      children: 1,
      infants: 1,
      sortOrder: 'asc',
      page: 1,
    });

    expect(flightBookingsService.expireOverdueHolds).toHaveBeenCalledTimes(1);
    // Cairo is UTC+2 on 2026-12-01 -> [2026-11-30T22:00:00Z, 2026-12-01T22:00:00Z)
    expect(flightModel.find).toHaveBeenCalledWith(
      expect.objectContaining({
        status: FlightStatus.SCHEDULED,
        'departure.airportId': caiId,
        'departure.timestamp': {
          $gte: new Date('2026-11-30T22:00:00Z'),
          $lt: new Date('2026-12-01T22:00:00Z'),
        },
      }),
    );

    expect(res.tripType).toBe('one-way');
    expect(res.passengers).toEqual({ adults: 2, children: 1, infants: 1, seatsRequired: 3 });
    expect(res.outbound.total).toBe(2);
    // Business cabin on outboundFlight only had 2 available seats (< 3 required), so only Economy qualifies
    expect(res.outbound.items[0].cabins).toEqual([
      {
        name: CabinType.ECONOMY,
        seatPrice: 30000,
        freeBagWeight: 23,
        seatCount: 5,
        availableSeats: 3,
        // 3 seated * 30000 + 1 infant * 3000 = 93000
        totalFare: 93000,
      },
    ]);
    expect(res.message).toBeNull();
  });

  it('supports round-trip search returning outbound and return options (FLT-12a)', async () => {
    const res = await service.search({
      departureAirportId: caiId.toString(),
      arrivalAirportId: lhrId.toString(),
      departureDate: '2026-12-01',
      returnDate: '2026-12-05',
      adults: 1,
      children: 0,
      infants: 0,
      sortOrder: 'asc',
      page: 1,
    });

    expect(res.tripType).toBe('round-trip');
    expect(res.outbound.total).toBe(2);
    expect(res.return?.total).toBe(1);
    expect(res.return?.items[0].number).toBe('778');
  });

  it('filters by price range and sorts by duration or price (FLT-15)', async () => {
    const sortedByDuration = await service.search({
      departureAirportId: caiId.toString(),
      arrivalAirportId: lhrId.toString(),
      departureDate: '2026-12-01',
      adults: 1,
      children: 0,
      infants: 0,
      sortBy: 'duration',
      sortOrder: 'asc',
      page: 1,
    });

    expect(sortedByDuration.outbound.items.map((f) => f.number)).toEqual(['779', '777']);

    const filteredByPrice = await service.search({
      departureAirportId: caiId.toString(),
      arrivalAirportId: lhrId.toString(),
      departureDate: '2026-12-01',
      adults: 1,
      children: 0,
      infants: 0,
      minPrice: 25000,
      maxPrice: 40000,
      sortOrder: 'asc',
      page: 1,
    });

    expect(filteredByPrice.outbound.items.map((f) => f.number)).toEqual(['777']);
    expect(filteredByPrice.outbound.items[0].cabins.map((c) => c.name)).toEqual([CabinType.ECONOMY]);
  });

  it('returns "No flights found." message when no flights match (FLT-11)', async () => {
    flightModel.find.mockReturnValue(chainQuery([]));

    const res = await service.search({
      departureAirportId: caiId.toString(),
      arrivalAirportId: lhrId.toString(),
      departureDate: '2026-12-01',
      adults: 1,
      children: 0,
      infants: 0,
      sortOrder: 'asc',
      page: 1,
    });

    expect(res.outbound.items).toEqual([]);
    expect(res.message).toBe('No flights found.');
  });

  it('rejects minPrice > maxPrice (FLT-15), infants > adults (FLT-12b), and identical airports (FLT-11)', async () => {
    await expect(
      service.search({
        departureAirportId: caiId.toString(),
        arrivalAirportId: lhrId.toString(),
        departureDate: '2026-12-01',
        adults: 1,
        children: 0,
        infants: 0,
        minPrice: 60000,
        maxPrice: 30000,
        sortOrder: 'asc',
        page: 1,
      }),
    ).rejects.toThrow(new BadRequestException('minPrice cannot be greater than maxPrice.'));

    await expect(
      service.search({
        departureAirportId: caiId.toString(),
        arrivalAirportId: lhrId.toString(),
        departureDate: '2026-12-01',
        adults: 1,
        children: 0,
        infants: 2,
        sortOrder: 'asc',
        page: 1,
      }),
    ).rejects.toThrow(new BadRequestException('Number of infants cannot exceed number of adults.'));

    await expect(
      service.search({
        departureAirportId: caiId.toString(),
        arrivalAirportId: caiId.toString(),
        departureDate: '2026-12-01',
        adults: 1,
        children: 0,
        infants: 0,
        sortOrder: 'asc',
        page: 1,
      }),
    ).rejects.toThrow(new BadRequestException('Departure and arrival airports must be different.'));
  });

  it('returns flight details with cabins, seats remaining, baggage allowance and policies (FLT-17)', async () => {
    flightModel.findById = vi.fn(() => chainQuery(outboundFlight));
    airlineModel.find = vi.fn(() =>
      chainQuery([
        {
          _id: airlineId,
          name: 'EgyptAir',
          iataCode: 'MS',
          logoUrl: 'https://example.com/ms.png',
          status: ProviderStatus.ACTIVE,
          bagPolicy: { priceExtraBag: 5000, maxExtraBagCount: 2 },
          cancellationPolicies: [{ daysBeforeService: { startDay: 7, endDay: null }, refundPercentage: 80 }],
        },
      ]),
    );

    const details = await service.getFlightDetails(outboundFlightId.toString());
    expect(details).toMatchObject({
      id: outboundFlightId.toString(),
      number: '777',
      durationMinutes: 330,
      baggagePolicy: { priceExtraBag: 5000, maxExtraBagCount: 2 },
      cancellationPolicy: [{ daysBeforeDeparture: 7, refundPercentage: 80 }],
    });
    expect(details.cabins[0]).toMatchObject({
      name: CabinType.ECONOMY,
      seatPrice: 30000,
      freeBagCount: 1,
      freeBagWeight: 23,
      seatCount: 5,
      availableSeats: 3,
    });
    expect(details.cabins[0].seats).toHaveLength(5);
  });
});
