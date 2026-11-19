import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CabinType } from '../database/schemas/flight.schema.js';
import { ProviderStatus } from '../database/schemas/provider.schema.js';
import { CreateFlightDto } from './dto/create-flight.dto.js';
import { FlightsService } from './flights.service.js';

/** Mimics a chainable mongoose query resolved by exec(). */
const query = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = { exec: vi.fn().mockResolvedValue(result) };
  for (const method of ['select', 'lean']) q[method] = vi.fn().mockReturnValue(q);
  return q;
};

describe('FlightsService.create (FLT-03, FLT-04)', () => {
  const NOW = new Date('2026-11-19T12:00:00Z');
  const moderatorId = new Types.ObjectId().toString();
  const airlineId = new Types.ObjectId();
  const cairoCity = { _id: new Types.ObjectId(), timeZone: 'Africa/Cairo' };
  const newYorkCity = { _id: new Types.ObjectId(), timeZone: 'America/New_York' };
  const cai = { _id: new Types.ObjectId(), cityId: cairoCity._id };
  const jfk = { _id: new Types.ObjectId(), cityId: newYorkCity._id };

  let flightModel: Record<string, ReturnType<typeof vi.fn>>;
  let airportModel: Record<string, ReturnType<typeof vi.fn>>;
  let cityModel: Record<string, ReturnType<typeof vi.fn>>;
  let airlinesService: { findOwnedAirline: ReturnType<typeof vi.fn> };
  let service: FlightsService;

  const dto = (overrides: Partial<CreateFlightDto> = {}): CreateFlightDto => ({
    airlineId: airlineId.toString(),
    number: '123',
    departureAirportId: cai._id.toString(),
    departureLocalTime: '2026-12-01T10:00',
    arrivalAirportId: jfk._id.toString(),
    arrivalLocalTime: '2026-12-01T14:30',
    maxBagWeight: 32,
    cabins: [
      { name: CabinType.BUSINESS, seatPrice: 150000, freeBagWeight: 32, firstRow: 1, lastRow: 4, layout: 'A-DF-K' },
      { name: CabinType.ECONOMY, seatPrice: 45000, freeBagWeight: 23, firstRow: 10, lastRow: 35, layout: 'ABC-DEF' },
    ],
    ...overrides,
  });

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    flightModel = {
      exists: vi.fn().mockReturnValue(query(null)),
      create: vi.fn(async (doc: Record<string, unknown>) => ({ _id: new Types.ObjectId(), ...doc })),
    };
    airportModel = { find: vi.fn().mockReturnValue(query([cai, jfk])) };
    cityModel = { find: vi.fn().mockReturnValue(query([cairoCity, newYorkCity])) };
    airlinesService = {
      findOwnedAirline: vi.fn().mockResolvedValue({ _id: airlineId, moderatorId, status: ProviderStatus.ACTIVE }),
    };
    service = new FlightsService(flightModel as any, airportModel as any, cityModel as any, airlinesService as any);
  });

  afterEach(() => vi.useRealTimers());

  it('stores local times as UTC, generates seats and returns the flight', async () => {
    const result = await service.create(moderatorId, dto());

    const saved = flightModel.create.mock.calls[0][0];
    expect(saved).toMatchObject({
      airlineId,
      number: '123',
      status: 'scheduled',
      departure: { airportId: cai._id, timestamp: new Date('2026-12-01T08:00:00Z') },
      arrival: { airportId: jfk._id, timestamp: new Date('2026-12-01T19:30:00Z') },
      maxBagWeight: 32,
    });
    expect(saved.cabins.map((cabin: { seats: unknown[] }) => cabin.seats.length)).toEqual([16, 156]);

    expect(airlinesService.findOwnedAirline).toHaveBeenCalledWith(airlineId.toString(), moderatorId);
    expect(result.departure).toEqual({
      airportId: cai._id.toString(),
      timestamp: '2026-12-01T08:00:00.000Z',
      localTime: '2026-12-01T10:00',
      timeZone: 'Africa/Cairo',
    });
    expect(result.arrival.localTime).toBe('2026-12-01T14:30');
    expect(result.cabins).toEqual([
      { name: 'Business', seatPrice: 150000, freeBagWeight: 32, seatCount: 16, availableSeats: 16 },
      { name: 'Economy', seatPrice: 45000, freeBagWeight: 23, seatCount: 156, availableSeats: 156 },
    ]);
  });

  it('checks the flight number against the whole local departure day', async () => {
    await service.create(moderatorId, dto({ departureLocalTime: '2026-12-01T00:30' }));

    expect(flightModel.exists).toHaveBeenCalledWith({
      airlineId,
      number: '123',
      status: { $ne: 'cancelled' },
      'departure.timestamp': { $gte: new Date('2026-11-30T22:00:00Z'), $lt: new Date('2026-12-01T22:00:00Z') },
    });
  });

  it('lets a cancelled flight number be reused on the same local date', async () => {
    const cancelled = { _id: new Types.ObjectId(), number: '123', status: 'cancelled' };
    // Behaves like MongoDB: only non-cancelled flights match the duplicate filter
    flightModel.exists.mockImplementation((filter: { status: { $ne: string } }) =>
      query(cancelled.status !== filter.status.$ne ? { _id: cancelled._id } : null),
    );

    const result = await service.create(moderatorId, dto());

    expect(result.status).toBe('scheduled');
    expect(flightModel.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a duplicate flight number on the same local date with 409', async () => {
    flightModel.exists.mockReturnValue(query({ _id: new Types.ObjectId() }));

    await expect(service.create(moderatorId, dto())).rejects.toThrow(
      new ConflictException('This airline already has flight 123 departing on 2026-12-01.'),
    );
    expect(flightModel.create).not.toHaveBeenCalled();
  });

  it('turns a unique-index race on insert into 409', async () => {
    flightModel.create.mockRejectedValue(Object.assign(new Error('E11000 duplicate key'), { code: 11000 }));

    await expect(service.create(moderatorId, dto())).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejects identical airports before any database call', async () => {
    await expect(service.create(moderatorId, dto({ arrivalAirportId: cai._id.toString() }))).rejects.toThrow(
      /must be different/,
    );
    expect(airlinesService.findOwnedAirline).not.toHaveBeenCalled();
  });

  it('rejects invalid cabins before any database call', async () => {
    const [business] = dto().cabins;
    await expect(service.create(moderatorId, dto({ cabins: [business, business] }))).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(airlinesService.findOwnedAirline).not.toHaveBeenCalled();
  });

  it('compares arrival and departure in UTC, not by local clock', async () => {
    // 03:00 in New York is 08:00 UTC: the same instant as the 10:00 Cairo departure
    await expect(service.create(moderatorId, dto({ arrivalLocalTime: '2026-12-01T03:00' }))).rejects.toThrow(
      /Arrival must be after departure/,
    );
  });

  it('rejects a departure in the past', async () => {
    await expect(
      service.create(moderatorId, dto({ departureLocalTime: '2026-11-19T13:00', arrivalLocalTime: '2026-11-19T20:00' })),
    ).rejects.toThrow(/future/); // 13:00 Cairo = 11:00 UTC, an hour before NOW
  });

  it('rejects a deactivated airline with 403', async () => {
    airlinesService.findOwnedAirline.mockResolvedValue({ _id: airlineId, moderatorId, status: ProviderStatus.DEACTIVATED });

    await expect(service.create(moderatorId, dto())).rejects.toBeInstanceOf(ForbiddenException);
    expect(airportModel.find).not.toHaveBeenCalled();
  });

  it("passes on the ownership error for another moderator's airline", async () => {
    airlinesService.findOwnedAirline.mockRejectedValue(new ForbiddenException('You can only manage your own airline.'));

    await expect(service.create(moderatorId, dto())).rejects.toBeInstanceOf(ForbiddenException);
    expect(flightModel.create).not.toHaveBeenCalled();
  });

  it('rejects an airport that is not in the list', async () => {
    airportModel.find.mockReturnValue(query([cai]));

    await expect(service.create(moderatorId, dto())).rejects.toThrow(/Arrival airport is not in the airport list/);
  });

  it('rejects with 400 when an airport city has no time zone', async () => {
    cityModel.find.mockReturnValue(query([cairoCity, { _id: newYorkCity._id }]));

    await expect(service.create(moderatorId, dto())).rejects.toThrow(
      new BadRequestException("Arrival airport's city has no time zone set, so its local time can't be converted."),
    );
    expect(flightModel.create).not.toHaveBeenCalled();
  });
});
