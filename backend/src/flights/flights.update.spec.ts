import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { CabinType, FlightStatus, SeatAvailability } from '../database/schemas/flight.schema.js';
import { ProviderStatus } from '../database/schemas/provider.schema.js';
import { generateSeats } from './cabin-seats.js';
import { FlightsService } from './flights.service.js';

/** Mimics a chainable mongoose query resolved by exec(). */
const query = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = { exec: vi.fn().mockResolvedValue(result) };
  for (const method of ['select', 'lean']) q[method] = vi.fn().mockReturnValue(q);
  return q;
};

describe('FlightsService update and cancel (FLT-05, FLT-06)', () => {
  const NOW = new Date('2026-11-19T12:00:00Z');
  const moderatorId = new Types.ObjectId().toString();
  const airlineId = new Types.ObjectId();
  const flightId = new Types.ObjectId();
  const cairoCity = { _id: new Types.ObjectId(), timeZone: 'Africa/Cairo' };
  const newYorkCity = { _id: new Types.ObjectId(), timeZone: 'America/New_York' };
  const londonCity = { _id: new Types.ObjectId(), timeZone: 'Europe/London' };
  const cai = { _id: new Types.ObjectId(), cityId: cairoCity._id };
  const jfk = { _id: new Types.ObjectId(), cityId: newYorkCity._id };
  const lhr = { _id: new Types.ObjectId(), cityId: londonCity._id };

  // CAI 2026-12-01 10:00 local (08:00Z) -> JFK 14:30 local (19:30Z)
  const flight = (seatState?: SeatAvailability, overrides: Record<string, unknown> = {}) => {
    const seats = generateSeats(10, 11, 'AB-CD');
    if (seatState) seats[0].availability = seatState;
    return {
      _id: flightId,
      airlineId,
      number: '123',
      status: FlightStatus.SCHEDULED,
      departure: { airportId: cai._id, timestamp: new Date('2026-12-01T08:00:00Z') },
      arrival: { airportId: jfk._id, timestamp: new Date('2026-12-01T19:30:00Z') },
      maxBagWeight: 32,
      cabins: [{ name: CabinType.ECONOMY, seatPrice: 45000, freeBagWeight: 23, seats }],
      ...overrides,
    };
  };

  let flightModel: Record<string, ReturnType<typeof vi.fn>>;
  let airlinesService: { findOwnedAirline: ReturnType<typeof vi.fn> };
  let service: FlightsService;

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    flightModel = {
      findById: vi.fn().mockReturnValue(query(flight())),
      findOneAndUpdate: vi.fn((_filter: unknown, update: { $set: Record<string, unknown> }) =>
        query({ ...flight(), ...update.$set, status: update.$set.status ?? FlightStatus.SCHEDULED }),
      ),
      exists: vi.fn().mockReturnValue(query(null)),
    };
    const airportModel = { find: vi.fn().mockReturnValue(query([cai, jfk, lhr])) };
    const cityModel = { find: vi.fn().mockReturnValue(query([cairoCity, newYorkCity, londonCity])) };
    airlinesService = {
      findOwnedAirline: vi.fn().mockResolvedValue({ _id: airlineId, moderatorId, status: ProviderStatus.ACTIVE }),
    };
    service = new FlightsService(flightModel as any, airportModel as any, cityModel as any, airlinesService as any);
  });

  afterEach(() => vi.useRealTimers());

  const savedSet = () => flightModel.findOneAndUpdate.mock.calls[0][1].$set;
  const savedFilter = () => flightModel.findOneAndUpdate.mock.calls[0][0];

  describe('update (FLT-05)', () => {
    it('requires at least one field', async () => {
      await expect(service.update(flightId.toString(), moderatorId, {})).rejects.toBeInstanceOf(BadRequestException);
      expect(flightModel.findById).not.toHaveBeenCalled();
    });

    it('converts a new departure local time to UTC and keeps the stored arrival', async () => {
      const result = await service.update(flightId.toString(), moderatorId, { departureLocalTime: '2026-12-01T12:00' });

      expect(savedSet()).toEqual({
        departure: { airportId: cai._id, timestamp: new Date('2026-12-01T10:00:00Z') },
        arrival: { airportId: jfk._id, timestamp: new Date('2026-12-01T19:30:00Z') },
      });
      expect(result.departure).toMatchObject({ localTime: '2026-12-01T12:00', timeZone: 'Africa/Cairo' });
      expect(result.arrival.localTime).toBe('2026-12-01T14:30');
    });

    it('re-checks the flight number on the new local date, ignoring this flight', async () => {
      await service.update(flightId.toString(), moderatorId, {
        departureLocalTime: '2026-12-02T10:00',
        arrivalLocalTime: '2026-12-02T14:30',
      });

      expect(flightModel.exists).toHaveBeenCalledWith({
        _id: { $ne: flightId },
        airlineId,
        number: '123',
        status: { $ne: 'cancelled' },
        'departure.timestamp': { $gte: new Date('2026-12-01T22:00:00Z'), $lt: new Date('2026-12-02T22:00:00Z') },
      });
    });

    it('rejects a duplicate flight number on the new date with 409', async () => {
      flightModel.exists.mockReturnValue(query({ _id: new Types.ObjectId() }));

      await expect(
        service.update(flightId.toString(), moderatorId, { departureLocalTime: '2026-12-02T10:00', arrivalLocalTime: '2026-12-02T14:30' }),
      ).rejects.toThrow('This airline already has flight 123 departing on 2026-12-02.');
      expect(flightModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('rejects an arrival that is no longer after the departure', async () => {
      // 20:00 in Cairo and 13:00 in New York are both 18:00 UTC: the same instant, so arrival is not after departure
      await expect(
        service.update(flightId.toString(), moderatorId, { departureLocalTime: '2026-12-01T20:00', arrivalLocalTime: '2026-12-01T13:00' }),
      ).rejects.toThrow(/Arrival must be after departure/);
    });

    it('rejects a departure moved into the past', async () => {
      await expect(
        service.update(flightId.toString(), moderatorId, { departureLocalTime: '2026-11-19T13:00' }),
      ).rejects.toThrow(/future/);
    });

    it('changes an airport while no seat is taken, guarding that inside the update', async () => {
      await service.update(flightId.toString(), moderatorId, {
        arrivalAirportId: lhr._id.toString(),
        arrivalLocalTime: '2026-12-01T13:00',
      });

      expect(savedSet().arrival).toEqual({ airportId: lhr._id, timestamp: new Date('2026-12-01T13:00:00Z') });
      expect(savedFilter().cabins).toEqual({ $not: { $elemMatch: { 'seats.availability': { $in: ['held', 'booked'] } } } });
    });

    it('does not add the seat guard when the airports stay the same', async () => {
      await service.update(flightId.toString(), moderatorId, { arrivalLocalTime: '2026-12-01T15:00' });

      expect(savedFilter()).not.toHaveProperty('cabins');
    });

    it.each([SeatAvailability.HELD, SeatAvailability.BOOKED])('refuses to change airports once a seat is %s (409)', async (state) => {
      flightModel.findById.mockReturnValue(query(flight(state)));

      await expect(
        service.update(flightId.toString(), moderatorId, { arrivalAirportId: lhr._id.toString(), arrivalLocalTime: '2026-12-01T13:00' }),
      ).rejects.toThrow("Airports can't change once a seat on this flight is held or booked.");
    });

    it('still allows time changes when seats are booked', async () => {
      flightModel.findById.mockReturnValue(query(flight(SeatAvailability.BOOKED)));

      await expect(
        service.update(flightId.toString(), moderatorId, { departureLocalTime: '2026-12-01T11:00' }),
      ).resolves.toBeDefined();
    });

    it('needs the local time when an airport changes', async () => {
      await expect(
        service.update(flightId.toString(), moderatorId, { arrivalAirportId: lhr._id.toString() }),
      ).rejects.toThrow('Send arrivalLocalTime when changing the arrival airport.');
    });

    it('rejects making both airports the same', async () => {
      await expect(
        service.update(flightId.toString(), moderatorId, { arrivalAirportId: cai._id.toString(), arrivalLocalTime: '2026-12-01T13:00' }),
      ).rejects.toThrow(/must be different/);
    });

    it('returns 409 when the guarded update matches nothing, and 409 on a unique-index race', async () => {
      flightModel.findOneAndUpdate.mockReturnValueOnce(query(null));
      await expect(service.update(flightId.toString(), moderatorId, { arrivalLocalTime: '2026-12-01T15:00' })).rejects.toThrow(
        /changed while saving/,
      );

      const race = query(null);
      race.exec.mockRejectedValue(Object.assign(new Error('E11000'), { code: 11000 }));
      flightModel.findOneAndUpdate.mockReturnValueOnce(race);
      await expect(service.update(flightId.toString(), moderatorId, { arrivalLocalTime: '2026-12-01T15:00' })).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('cancel (FLT-06)', () => {
    it('cancels and releases held seats in one update, only while still Scheduled and not departed', async () => {
      const result = await service.cancel(flightId.toString(), moderatorId);

      const [filter, update, options] = flightModel.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ _id: flightId, status: 'scheduled', 'departure.timestamp': { $gt: NOW } });
      expect(update).toEqual({
        $set: { status: 'cancelled', 'cabins.$[].seats.$[held].availability': 'available' },
      });
      expect(options).toEqual({ returnDocument: 'after', arrayFilters: [{ 'held.availability': 'held' }] });
      expect(result.status).toBe('cancelled');
    });

    it.each([
      ['already cancelled', { status: FlightStatus.CANCELLED }, /cancelled/],
      ['departed', { departure: { airportId: cai._id, timestamp: new Date('2026-11-19T11:00:00Z') } }, /already departed/],
    ])('rejects a flight that is %s with 409', async (_label, overrides, message) => {
      flightModel.findById.mockReturnValue(query(flight(undefined, overrides)));

      await expect(service.cancel(flightId.toString(), moderatorId)).rejects.toThrow(message);
      expect(flightModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it("rejects another moderator's flight and unknown flights", async () => {
      airlinesService.findOwnedAirline.mockRejectedValueOnce(new ForbiddenException());
      await expect(service.cancel(flightId.toString(), moderatorId)).rejects.toBeInstanceOf(ForbiddenException);

      await expect(service.cancel('nope', moderatorId)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns 409 if the flight changed between the read and the cancel', async () => {
      flightModel.findOneAndUpdate.mockReturnValue(query(null));

      await expect(service.cancel(flightId.toString(), moderatorId)).rejects.toThrow(/changed while saving/);
    });

    it('cancels confirmed bookings with a 100% refund, expires pending holds, and notifies passengers (FLT-06)', async () => {
      const bookingId = new Types.ObjectId();
      const userId = new Types.ObjectId();
      const confirmedBooking = {
        _id: bookingId,
        userId,
        reference: 'K7M2QX',
        status: 'confirmed',
        payment: { paymentIntentId: 'pi_123', amount: 45000 },
        extraPayments: [],
      };
      const bookingModel = {
        updateMany: vi.fn().mockReturnValue(query({ modifiedCount: 1 })),
        find: vi.fn().mockReturnValue(query([confirmedBooking])),
        findOneAndUpdate: vi.fn().mockReturnValue(query({ ...confirmedBooking, status: 'cancelled' })),
      };
      const refundsService = { issueAcross: vi.fn().mockResolvedValue([]) };
      const notificationsService = { create: vi.fn().mockResolvedValue({}) };
      const airportModel = { find: vi.fn().mockReturnValue(query([cai, jfk, lhr])) };
      const cityModel = { find: vi.fn().mockReturnValue(query([cairoCity, newYorkCity, londonCity])) };

      const fullService = new FlightsService(
        flightModel as never,
        airportModel as never,
        cityModel as never,
        airlinesService as never,
        bookingModel as never,
        refundsService as never,
        notificationsService as never,
      );

      await fullService.cancel(flightId.toString(), moderatorId);

      expect(bookingModel.updateMany).toHaveBeenCalledWith(
        { status: 'pending payment', 'segments.flightId': flightId },
        { $set: { status: 'expired', holdExpiresAt: null } },
      );
      expect(refundsService.issueAcross).toHaveBeenCalledWith(
        { bookingId, bookingType: 'flight', userId },
        [{ paymentIntentId: 'pi_123', amount: 45000 }],
        45000,
      );
      expect(notificationsService.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'flight_cancelled',
        }),
      );
    });
  });
});
