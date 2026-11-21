import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CabinType } from '../database/schemas/flight.schema.js';
import { ItineraryVisibility } from '../database/schemas/itinerary.schema.js';
import { ItinerarySearchService } from './itinerary-search.service.js';

const chainQuery = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = {
    exec: vi.fn().mockResolvedValue(result),
  };
  for (const method of ['select', 'lean', 'sort']) {
    q[method] = vi.fn().mockReturnValue(q);
  }
  return q;
};

describe('ItinerarySearchService (ITN-25, ITN-26)', () => {
  const ownerId = new Types.ObjectId();
  const itineraryId = new Types.ObjectId();
  const londonCityId = new Types.ObjectId();
  const originAirportId = new Types.ObjectId();
  const lhrAirportId = new Types.ObjectId();
  const lgwAirportId = new Types.ObjectId();

  let airportModel: Record<string, ReturnType<typeof vi.fn>>;
  let itinerariesService: { findOwned: ReturnType<typeof vi.fn> };
  let presenter: {
    cityNames: ReturnType<typeof vi.fn>;
    cityRef: ReturnType<typeof vi.fn>;
    groupsOf: ReturnType<typeof vi.fn>;
  };
  let service: ItinerarySearchService;

  beforeEach(() => {
    airportModel = {
      findOne: vi.fn(() =>
        chainQuery({ _id: originAirportId, iataCode: 'CAI', name: 'Cairo International Airport', cityId: new Types.ObjectId() }),
      ),
      find: vi.fn(() =>
        chainQuery([
          { _id: lhrAirportId, iataCode: 'LHR', name: 'Heathrow Airport', cityId: londonCityId },
          { _id: lgwAirportId, iataCode: 'LGW', name: 'Gatwick Airport', cityId: londonCityId },
        ]),
      ),
    };

    itinerariesService = {
      findOwned: vi.fn().mockResolvedValue({
        _id: itineraryId,
        userId: ownerId,
        title: 'UK Winter Trip',
        startDate: new Date('2026-12-10T00:00:00.000Z'),
        visibility: ItineraryVisibility.PRIVATE,
        days: [
          { _id: new Types.ObjectId(), cityId: londonCityId },
          { _id: new Types.ObjectId(), cityId: londonCityId },
          { _id: new Types.ObjectId(), cityId: londonCityId },
          { _id: new Types.ObjectId(), cityId: londonCityId },
        ],
      }),
    };

    presenter = {
      cityNames: vi.fn().mockResolvedValue(new Map([[londonCityId.toString(), 'London']])),
      cityRef: vi.fn((id: Types.ObjectId) => ({ id: id.toString(), name: 'London' })),
      groupsOf: vi.fn().mockReturnValue([
        {
          index: 0,
          city: { id: londonCityId.toString(), name: 'London' },
          firstDayNumber: 1,
          lastDayNumber: 4,
          dayCount: 4,
          startDate: '2026-12-10',
          endDate: '2026-12-13',
        },
      ]),
    };

    service = new ItinerarySearchService(
      airportModel as never,
      itinerariesService as never,
      presenter as never,
    );
  });

  it('builds a reusable GET /api/hotels/search query using city name and checkOut = day after last day (ITN-25)', async () => {
    const result = await service.hotels(ownerId.toString(), itineraryId.toString(), {
      groupIndex: 0,
      guests: 2,
      rooms: 1,
    });

    expect(result.checkIn).toBe('2026-12-10');
    expect(result.checkOut).toBe('2026-12-14');
    expect(result.search).toEqual({
      method: 'GET',
      path: '/api/hotels/search',
      query: {
        city: 'London',
        checkIn: '2026-12-10',
        checkOut: '2026-12-14',
        guests: 2,
        rooms: 1,
      },
    });
  });

  it('defaults outboundDate to startDate and returnDate to last day date with GET /api/flights/search query parameters (ITN-26)', async () => {
    const result = await service.flights(ownerId.toString(), itineraryId.toString(), {
      origin: 'CAI',
      tripType: 'round-trip',
      adults: 2,
      children: 0,
      infants: 0,
      cabinClass: CabinType.ECONOMY,
    });

    expect(result.destinationCity).toEqual({ id: londonCityId.toString(), name: 'London' });
    expect(result.outboundDate).toBe('2026-12-10');
    expect(result.returnDate).toBe('2026-12-13');
    expect(result.searches).toEqual([
      {
        method: 'GET',
        path: '/api/flights/search',
        query: {
          departureAirportId: originAirportId.toString(),
          arrivalAirportId: lhrAirportId.toString(),
          departureDate: '2026-12-10',
          returnDate: '2026-12-13',
          adults: 2,
          children: 0,
          infants: 0,
          cabin: CabinType.ECONOMY,
        },
      },
      {
        method: 'GET',
        path: '/api/flights/search',
        query: {
          departureAirportId: originAirportId.toString(),
          arrivalAirportId: lgwAirportId.toString(),
          departureDate: '2026-12-10',
          returnDate: '2026-12-13',
          adults: 2,
          children: 0,
          infants: 0,
          cabin: CabinType.ECONOMY,
        },
      },
    ]);
  });

  it('throws 400 when the itinerary has no days yet (ITN-26)', async () => {
    itinerariesService.findOwned.mockResolvedValueOnce({
      _id: itineraryId,
      userId: ownerId,
      title: 'Empty Trip',
      startDate: new Date('2026-12-10T00:00:00.000Z'),
      visibility: ItineraryVisibility.PRIVATE,
      days: [],
    });

    await expect(
      service.flights(ownerId.toString(), itineraryId.toString(), {
        origin: 'CAI',
        tripType: 'one-way',
        adults: 1,
        children: 0,
        infants: 0,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('throws 404 when the first day city has no airport (ITN-26)', async () => {
    airportModel.find.mockReturnValueOnce(chainQuery([]));

    await expect(
      service.flights(ownerId.toString(), itineraryId.toString(), {
        origin: 'CAI',
        tripType: 'one-way',
        adults: 1,
        children: 0,
        infants: 0,
      }),
    ).rejects.toThrow(NotFoundException);
  });
});
