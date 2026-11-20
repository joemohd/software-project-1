import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ItineraryVisibility } from '../database/schemas/itinerary.schema.js';
import { UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import { ItinerariesService } from './itineraries.service.js';

const chainQuery = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = {
    exec: vi.fn().mockResolvedValue(result),
  };
  for (const method of ['select', 'lean']) {
    q[method] = vi.fn().mockReturnValue(q);
  }
  return q;
};

describe('ItinerariesService.searchFlights (ITN-26)', () => {
  const ownerId = new Types.ObjectId();
  const otherUserId = new Types.ObjectId();
  const itineraryId = new Types.ObjectId();
  const londonCityId = new Types.ObjectId();
  const originAirportId = new Types.ObjectId();
  const lhrAirportId = new Types.ObjectId();
  const lgwAirportId = new Types.ObjectId();

  const owner = {
    id: ownerId.toString(),
    role: UserRole.USER,
    status: UserActivityStatus.ACTIVE,
    isVerified: true,
  };

  let itineraryModel: Record<string, ReturnType<typeof vi.fn>>;
  let cityModel: Record<string, ReturnType<typeof vi.fn>>;
  let airportModel: Record<string, ReturnType<typeof vi.fn>>;
  let expenseModel: Record<string, ReturnType<typeof vi.fn>>;
  let roomModel: Record<string, ReturnType<typeof vi.fn>>;
  let hotelModel: Record<string, ReturnType<typeof vi.fn>>;
  let flightSearchService: { searchForAirports: ReturnType<typeof vi.fn> };
  let service: ItinerariesService;

  beforeEach(() => {
    itineraryModel = {
      findById: vi.fn(() =>
        chainQuery({
          _id: itineraryId,
          userId: ownerId,
          title: 'UK Winter Trip',
          startDate: new Date('2026-12-10T00:00:00.000Z'),
          visibility: ItineraryVisibility.PRIVATE,
          days: [
            { cityId: londonCityId, expenseIds: [] },
            { cityId: londonCityId, expenseIds: [] },
            { cityId: londonCityId, expenseIds: [] },
            { cityId: londonCityId, expenseIds: [] },
          ],
        }),
      ),
    };
    cityModel = {
      findById: vi.fn(() => chainQuery({ _id: londonCityId, name: 'London' })),
    };
    airportModel = {
      find: vi.fn(() => chainQuery([{ _id: lhrAirportId }, { _id: lgwAirportId }])),
      exists: vi.fn(() => chainQuery({ _id: originAirportId })),
    };
    expenseModel = {
      find: vi.fn(() => chainQuery([])),
    };
    roomModel = {
      findById: vi.fn(() => chainQuery(null)),
    };
    hotelModel = {
      findById: vi.fn(() => chainQuery(null)),
    };
    flightSearchService = {
      searchForAirports: vi.fn().mockResolvedValue({
        tripType: 'round-trip',
        passengers: { adults: 2, children: 0, infants: 0, seatsRequired: 2 },
        outbound: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 },
        return: { items: [], page: 1, pageSize: 10, total: 0, totalPages: 0 },
        message: 'No flights found.',
      }),
    };

    service = new ItinerariesService(
      itineraryModel as never,
      cityModel as never,
      airportModel as never,
      expenseModel as never,
      roomModel as never,
      hotelModel as never,
      flightSearchService as never,
    );
  });

  it('defaults outboundDate to startDate and returnDate to last day date for round-trip searches across all airports in day-1 city', async () => {
    const result = await service.searchFlights(owner, itineraryId.toString(), {
      originAirportId: originAirportId.toString(),
      tripType: 'round-trip',
      adults: 2,
      children: 0,
      infants: 0,
      sortOrder: 'asc',
      page: 1,
    });

    // 4 days starting 2026-12-10 -> last day is 2026-12-13
    expect(flightSearchService.searchForAirports).toHaveBeenCalledWith(
      expect.objectContaining({
        departureAirportIds: [originAirportId.toString()],
        arrivalAirportIds: [lhrAirportId.toString(), lgwAirportId.toString()],
        departureDate: '2026-12-10',
        returnDate: '2026-12-13',
        adults: 2,
      }),
    );
    expect(result.itineraryId).toBe(itineraryId.toString());
    expect(result.destinationCity).toEqual({ id: londonCityId.toString(), name: 'London' });
    expect(result.outboundDate).toBe('2026-12-10');
    expect(result.returnDate).toBe('2026-12-13');
  });

  it('resolves the first day city from day-1 expenses when day.cityId is not set directly', async () => {
    const activityId = new Types.ObjectId();
    itineraryModel.findById.mockReturnValue(
      chainQuery({
        _id: itineraryId,
        userId: ownerId,
        title: 'UK Winter Trip',
        startDate: new Date('2026-12-10T00:00:00.000Z'),
        visibility: ItineraryVisibility.PUBLIC,
        days: [{ expenseIds: [activityId] }],
      }),
    );
    expenseModel.find.mockReturnValue(
      chainQuery([{ _id: activityId, expenseType: 'activity', cityId: londonCityId }]),
    );

    await service.searchFlights(
      { ...owner, id: otherUserId.toString() },
      itineraryId.toString(),
      {
        originAirportId: originAirportId.toString(),
        tripType: 'one-way',
        children: 0,
        infants: 0,
        sortOrder: 'asc',
        page: 1,
      },
    );

    expect(flightSearchService.searchForAirports).toHaveBeenCalledWith(
      expect.objectContaining({
        arrivalAirportIds: [lhrAirportId.toString(), lgwAirportId.toString()],
        departureDate: '2026-12-10',
        returnDate: undefined,
      }),
    );
  });

  it('rejects another user accessing a private itinerary with 403 (ACC-11)', async () => {
    await expect(
      service.searchFlights(
        { ...owner, id: otherUserId.toString() },
        itineraryId.toString(),
        {
          originAirportId: originAirportId.toString(),
          children: 0,
          infants: 0,
          sortOrder: 'asc',
          page: 1,
        },
      ),
    ).rejects.toThrow(ForbiddenException);
  });

  it('returns 404 when the itinerary is hidden and caller is neither owner nor admin (GEN-10)', async () => {
    itineraryModel.findById.mockReturnValue(
      chainQuery({
        _id: itineraryId,
        userId: ownerId,
        title: 'Hidden Trip',
        startDate: new Date('2026-12-10T00:00:00.000Z'),
        visibility: ItineraryVisibility.PUBLIC,
        isHidden: true,
        days: [{ cityId: londonCityId, expenseIds: [] }],
      }),
    );

    await expect(
      service.searchFlights(
        { ...owner, id: otherUserId.toString() },
        itineraryId.toString(),
        {
          originAirportId: originAirportId.toString(),
          children: 0,
          infants: 0,
          sortOrder: 'asc',
          page: 1,
        },
      ),
    ).rejects.toThrow(NotFoundException);
  });

  it('throws 400 when the first day has no city assigned', async () => {
    itineraryModel.findById.mockReturnValue(
      chainQuery({
        _id: itineraryId,
        userId: ownerId,
        title: 'Incomplete Trip',
        startDate: new Date('2026-12-10T00:00:00.000Z'),
        visibility: ItineraryVisibility.PRIVATE,
        days: [{ expenseIds: [] }],
      }),
    );

    await expect(
      service.searchFlights(owner, itineraryId.toString(), {
        originAirportId: originAirportId.toString(),
        children: 0,
        infants: 0,
        sortOrder: 'asc',
        page: 1,
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
