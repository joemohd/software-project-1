import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CabinType, FlightStatus, SeatAvailability } from '../database/schemas/flight.schema.js';
import { ProviderStatus } from '../database/schemas/provider.schema.js';
import { generateSeats } from './cabin-seats.js';
import { CreateCabinDto } from './dto/create-flight.dto.js';
import { FlightsService, resizeCabinStage } from './flights.service.js';

/** Mimics a chainable mongoose query resolved by exec(). */
const query = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = { exec: vi.fn().mockResolvedValue(result) };
  for (const method of ['select', 'lean']) q[method] = vi.fn().mockReturnValue(q);
  return q;
};

describe('FlightsService cabins (FLT-04, FLT-05)', () => {
  const NOW = new Date('2026-11-19T12:00:00Z');
  const moderatorId = new Types.ObjectId().toString();
  const airlineId = new Types.ObjectId();
  const flightId = new Types.ObjectId();
  const cairoCity = { _id: new Types.ObjectId(), timeZone: 'Africa/Cairo' };
  const cai = { _id: new Types.ObjectId(), cityId: cairoCity._id };
  const hrg = { _id: new Types.ObjectId(), cityId: cairoCity._id };

  // Business rows 1-4, Economy rows 10-12 with 11B held and 12A booked
  const flight = (overrides: Record<string, unknown> = {}) => {
    const economySeats = generateSeats(10, 12, 'AB-CD');
    for (const seat of economySeats) {
      if (seat.row === 11 && seat.column === 'B') seat.availability = SeatAvailability.HELD;
      if (seat.row === 12 && seat.column === 'A') seat.availability = SeatAvailability.BOOKED;
    }
    return {
      _id: flightId,
      airlineId,
      number: '123',
      status: FlightStatus.SCHEDULED,
      departure: { airportId: cai._id, timestamp: new Date('2026-12-01T08:00:00Z') },
      arrival: { airportId: hrg._id, timestamp: new Date('2026-12-01T09:00:00Z') },
      maxBagWeight: 32,
      cabins: [
        { name: CabinType.BUSINESS, seatPrice: 150000, freeBagWeight: 32, seats: generateSeats(1, 4, 'A-DF-K') },
        { name: CabinType.ECONOMY, seatPrice: 45000, freeBagWeight: 23, seats: economySeats },
      ],
      ...overrides,
    };
  };

  const premium = {
    name: CabinType.PREMIUM_ECONOMY,
    seatPrice: 80000,
    freeBagWeight: 23,
    firstRow: 5,
    lastRow: 8,
    layout: 'AC-DF',
  } satisfies CreateCabinDto;

  let flightModel: Record<string, ReturnType<typeof vi.fn>>;
  let airlinesService: { findOwnedAirline: ReturnType<typeof vi.fn> };
  let service: FlightsService;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    flightModel = {
      findById: vi.fn().mockReturnValue(query(flight())),
      findOneAndUpdate: vi.fn().mockReturnValue(query(flight())),
    };
    const airportModel = { find: vi.fn().mockReturnValue(query([cai, hrg])) };
    const cityModel = { find: vi.fn().mockReturnValue(query([cairoCity])) };
    airlinesService = {
      findOwnedAirline: vi.fn().mockResolvedValue({ _id: airlineId, moderatorId, status: ProviderStatus.ACTIVE }),
    };
    service = new FlightsService(flightModel as any, airportModel as any, cityModel as any, airlinesService as any);
  });

  afterEach(() => vi.useRealTimers());

  describe('shared checks', () => {
    it('returns 404 for a malformed or unknown flight id', async () => {
      await expect(service.addCabin('abc', moderatorId, premium)).rejects.toBeInstanceOf(NotFoundException);
      flightModel.findById.mockReturnValue(query(null));
      await expect(service.addCabin(flightId.toString(), moderatorId, premium)).rejects.toBeInstanceOf(NotFoundException);
    });

    it("checks ownership against the flight's airline before revealing its state", async () => {
      flightModel.findById.mockReturnValue(query(flight({ status: FlightStatus.CANCELLED })));
      airlinesService.findOwnedAirline.mockRejectedValue(new ForbiddenException());

      await expect(service.addCabin(flightId.toString(), moderatorId, premium)).rejects.toBeInstanceOf(ForbiddenException);
      expect(airlinesService.findOwnedAirline).toHaveBeenCalledWith(airlineId.toString(), moderatorId);
    });

    it.each([
      ['cancelled', { status: FlightStatus.CANCELLED }, /cancelled/],
      ['departed', { status: FlightStatus.DEPARTED }, /departed/],
      ['past departure time', { departure: { airportId: cai._id, timestamp: new Date('2026-11-19T11:00:00Z') } }, /already departed/],
    ])('rejects a %s flight with 409', async (_label, overrides, message) => {
      flightModel.findById.mockReturnValue(query(flight(overrides)));

      await expect(service.updateCabin(flightId.toString(), 'Economy', moderatorId, { seatPrice: 1 })).rejects.toThrow(message);
      expect(flightModel.findOneAndUpdate).not.toHaveBeenCalled();
    });
  });

  describe('addCabin (FLT-04)', () => {
    it('pushes the generated cabin with guards in the same update', async () => {
      await service.addCabin(flightId.toString(), moderatorId, premium);

      const [filter, update] = flightModel.findOneAndUpdate.mock.calls[0];
      expect(filter).toMatchObject({ _id: flightId, status: 'scheduled', 'departure.timestamp': { $gt: NOW } });
      expect(filter.$and[0]).toEqual({ 'cabins.name': { $ne: 'Premium Economy' } });
      expect(update.$push.cabins).toMatchObject({ name: 'Premium Economy', seatPrice: 80000, freeBagWeight: 23 });
      expect(update.$push.cabins.seats).toHaveLength(16);
    });

    it('rejects a cabin type the flight already has with 409', async () => {
      await expect(
        service.addCabin(flightId.toString(), moderatorId, { ...premium, name: CabinType.ECONOMY, firstRow: 20, lastRow: 25 }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('rejects rows that overlap an existing cabin with 400', async () => {
      await expect(
        service.addCabin(flightId.toString(), moderatorId, { ...premium, firstRow: 3, lastRow: 6 }),
      ).rejects.toThrow('Premium Economy rows 3-6 overlap Business rows 1-4.');
    });

    it('rejects a free allowance above the flight max bag weight with 400', async () => {
      await expect(
        service.addCabin(flightId.toString(), moderatorId, { ...premium, freeBagWeight: 40 }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 409 when the guarded update matches nothing (changed meanwhile)', async () => {
      flightModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(service.addCabin(flightId.toString(), moderatorId, premium)).rejects.toThrow(/changed while saving/);
    });
  });

  describe('updateCabin (FLT-05)', () => {
    const lastStage = () => flightModel.findOneAndUpdate.mock.calls[0][1][0];

    it('requires at least one field', async () => {
      await expect(service.updateCabin(flightId.toString(), 'Economy', moderatorId, {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(flightModel.findById).not.toHaveBeenCalled();
    });

    it('returns 404 for a cabin the flight does not have', async () => {
      await expect(service.updateCabin(flightId.toString(), 'First', moderatorId, { seatPrice: 1 })).rejects.toThrow(
        'This flight has no "First" cabin.',
      );
    });

    it('changes only the price when no rows are sent', async () => {
      await service.updateCabin(flightId.toString(), 'Economy', moderatorId, { seatPrice: 47000 });

      expect(lastStage()).toEqual(resizeCabinStage('Economy', 10, 12, [], 47000));
      expect(flightModel.findOneAndUpdate.mock.calls[0][2]).toEqual({ returnDocument: 'after', updatePipeline: true });
    });

    it('adds new rows using the cabin layout and keeps the old price', async () => {
      await service.updateCabin(flightId.toString(), 'Economy', moderatorId, { lastRow: 14 });

      const added = generateSeats(13, 14, 'AB-CD');
      expect(lastStage()).toEqual(resizeCabinStage('Economy', 10, 14, added, 45000));
    });

    it('rejects removing rows that have held or booked seats with 409, listing them', async () => {
      await expect(service.updateCabin(flightId.toString(), 'Economy', moderatorId, { firstRow: 12 })).rejects.toThrow(
        "Can't remove those rows: 1 seat(s) are held or booked (11B).",
      );
      await expect(service.updateCabin(flightId.toString(), 'Economy', moderatorId, { lastRow: 10 })).rejects.toThrow(
        /\(11B, 12A\)/,
      );
      expect(flightModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('allows removing rows whose seats are all available', async () => {
      const economy = flight().cabins[1];
      flightModel.findById.mockReturnValue(
        query(flight({ cabins: [flight().cabins[0], { ...economy, seats: generateSeats(10, 12, 'AB-CD') }] })),
      );

      await service.updateCabin(flightId.toString(), 'Economy', moderatorId, { firstRow: 11 });

      expect(lastStage()).toEqual(resizeCabinStage('Economy', 11, 12, [], 45000));
    });

    it('guards the removed rows and the other cabins inside the update filter', async () => {
      await service.updateCabin(flightId.toString(), 'Economy', moderatorId, { lastRow: 14 });

      const [filter] = flightModel.findOneAndUpdate.mock.calls[0];
      expect(filter.$and[0].cabins.$elemMatch).toEqual({
        name: 'Economy',
        seats: {
          $not: {
            $elemMatch: { availability: { $in: ['held', 'booked'] }, $or: [{ row: { $lt: 10 } }, { row: { $gt: 14 } }] },
          },
        },
      });
      expect(filter.$and[1]).toEqual({
        cabins: { $not: { $elemMatch: { name: { $ne: 'Economy' }, seats: { $elemMatch: { row: { $gte: 10, $lte: 14 } } } } } },
      });
    });

    it('rejects rows that would overlap another cabin with 400', async () => {
      await expect(service.updateCabin(flightId.toString(), 'Economy', moderatorId, { firstRow: 4 })).rejects.toThrow(
        /overlap Business/,
      );
    });

    it('returns 409 when the guarded update matches nothing (a seat was taken meanwhile)', async () => {
      flightModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(service.updateCabin(flightId.toString(), 'Economy', moderatorId, { lastRow: 14 })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });
});
