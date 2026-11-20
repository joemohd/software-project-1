import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BookingStatus, PassengerType } from '../database/schemas/expense.schema.js';
import { CabinType, FlightStatus, SeatAvailability } from '../database/schemas/flight.schema.js';
import { ProviderStatus } from '../database/schemas/provider.schema.js';
import { generateSeats } from '../flights/cabin-seats.js';
import { CreateFlightBookingDto } from './dto/create-flight-booking.dto.js';
import { FlightBookingsService } from './flight-bookings.service.js';

/** Mimics a chainable mongoose query resolved by exec(). */
const query = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = { exec: vi.fn().mockResolvedValue(result) };
  for (const method of ['select', 'lean', 'limit']) q[method] = vi.fn().mockReturnValue(q);
  return q;
};

type Mocked = Record<string, ReturnType<typeof vi.fn>>;

describe('FlightBookingsService (FLT-19, FLT-21)', () => {
  const NOW = new Date('2026-11-19T12:00:00Z');
  const userId = new Types.ObjectId().toString();
  const cairo = { _id: new Types.ObjectId(), timeZone: 'Africa/Cairo' };
  const newYork = { _id: new Types.ObjectId(), timeZone: 'America/New_York' };
  const cai = { _id: new Types.ObjectId(), iataCode: 'CAI', cityId: cairo._id };
  const jfk = { _id: new Types.ObjectId(), iataCode: 'JFK', cityId: newYork._id };
  const airline = {
    _id: new Types.ObjectId(),
    name: 'EgyptAir',
    iataCode: 'MS',
    status: ProviderStatus.ACTIVE,
    bagPolicy: { priceExtraBag: 5000, maxExtraBagCount: 2 },
  };

  const flightFrom = (from: typeof cai, to: typeof cai, departure: string, arrival: string, overrides: Record<string, unknown> = {}) => ({
    _id: new Types.ObjectId(),
    airlineId: airline._id,
    number: from === cai ? '123' : '124',
    status: FlightStatus.SCHEDULED,
    departure: { airportId: from._id, timestamp: new Date(departure) },
    arrival: { airportId: to._id, timestamp: new Date(arrival) },
    maxBagWeight: 32,
    cabins: [{ name: CabinType.ECONOMY, seatPrice: 45000, freeBagWeight: 23, seats: generateSeats(10, 12, 'ABC-DEF') }],
    ...overrides,
  });

  // CAI 2026-12-01 10:00 local -> JFK; return JFK 2026-12-10 -> CAI
  let outbound: ReturnType<typeof flightFrom>;
  let inbound: ReturnType<typeof flightFrom>;
  let flightModel: Mocked;
  let bookingModel: Mocked;
  let airlineModel: Mocked;
  let service: FlightBookingsService;

  const adult = (passportNumber = 'A1234567', extraBagWeights: number[] = []) => ({
    fullName: 'Mona Hassan',
    dateOfBirth: '1990-05-31',
    passportNumber,
    extraBagWeights,
  });
  const infant = { fullName: 'Baby Hassan', dateOfBirth: '2026-01-15', passportNumber: 'C1234567' };
  const oneWay = (passengers: CreateFlightBookingDto['passengers'] = [adult()]): CreateFlightBookingDto => ({
    segments: [{ flightId: outbound._id.toString(), cabinName: CabinType.ECONOMY }],
    passengers,
  });
  const roundTrip = (passengers: CreateFlightBookingDto['passengers'] = [adult()]): CreateFlightBookingDto => ({
    segments: [
      { flightId: outbound._id.toString(), cabinName: CabinType.ECONOMY },
      { flightId: inbound._id.toString(), cabinName: CabinType.ECONOMY },
    ],
    passengers,
  });

  const holdCalls = () => flightModel.findOneAndUpdate.mock.calls;
  const releaseCalls = () => flightModel.updateOne.mock.calls;
  const savedBooking = () => bookingModel.create.mock.calls.at(-1)?.[0];

  beforeEach(() => {
    vi.useFakeTimers({ now: NOW, toFake: ['Date'] });
    outbound = flightFrom(cai, jfk, '2026-12-01T08:00:00Z', '2026-12-01T19:30:00Z');
    inbound = flightFrom(jfk, cai, '2026-12-10T22:00:00Z', '2026-12-11T15:00:00Z');

    flightModel = {
      collection: { collectionName: 'flights' } as never,
      find: vi.fn(() => query([outbound, inbound])),
      findById: vi.fn(() => query(outbound)),
      findOneAndUpdate: vi.fn(() => query({ _id: outbound._id })),
      updateOne: vi.fn(() => query({ matchedCount: 1 })),
    };
    bookingModel = {
      find: vi.fn(() => query([])),
      findOneAndUpdate: vi.fn(() => query(null)),
      create: vi.fn(async (data: Record<string, unknown>) => ({ toObject: () => ({ _id: new Types.ObjectId(), ...data }) })),
    };
    airlineModel = { find: vi.fn(() => query([airline])) };
    const airportModel = { find: vi.fn(() => query([cai, jfk])) };
    const cityModel = { find: vi.fn(() => query([cairo, newYork])) };
    service = new FlightBookingsService(
      bookingModel as never,
      flightModel as never,
      airlineModel as never,
      airportModel as never,
      cityModel as never,
      { stripe: { paymentIntents: { cancel: vi.fn() } } } as never,
      { issue: vi.fn(async () => null) } as never,
    );
  });

  afterEach(() => vi.useRealTimers());

  describe('create', () => {
    it('holds seats, saves a Pending Payment booking and returns the summary', async () => {
      const result = await service.create(userId, oneWay([adult('A1234567', [20]), adult('B1234567'), infant]));

      // One guarded hold for the 2 seated passengers, matching only while both seats are available
      expect(holdCalls()).toHaveLength(1);
      const [filter, update, options] = holdCalls()[0];
      expect(filter).toMatchObject({ _id: outbound._id, status: FlightStatus.SCHEDULED });
      expect(filter.$and).toHaveLength(2);
      expect(filter.$and[0]).toEqual({
        cabins: { $elemMatch: { name: 'Economy', seats: { $elemMatch: { row: 10, column: 'A', availability: SeatAvailability.AVAILABLE } } } },
      });
      expect(update).toEqual({ $set: { 'cabins.$[cabin].seats.$[seat].availability': SeatAvailability.HELD } });
      expect(options.arrayFilters[1]).toEqual({
        $or: [
          { 'seat.row': 10, 'seat.column': 'A', 'seat.availability': SeatAvailability.AVAILABLE },
          { 'seat.row': 10, 'seat.column': 'B', 'seat.availability': SeatAvailability.AVAILABLE },
        ],
      });

      const saved = savedBooking();
      expect(saved).toMatchObject({
        name: 'MS 123 CAI -> JFK',
        expenseType: 'flight_booking',
        status: BookingStatus.PENDING_PAYMENT,
        fareTotal: 45000 * 2 + 4500,
        baggageFee: 5000,
        cost: 94500 + 5000,
        holdExpiresAt: new Date('2026-11-19T12:10:00Z'),
      });
      expect(saved.reference).toMatch(/^[A-Z2-9]{6}$/);
      expect(saved.segments[0].seats).toEqual([
        { passengerIndex: 0, row: 10, column: 'A' },
        { passengerIndex: 1, row: 10, column: 'B' },
      ]);
      expect(saved.passengers.map((p: { type: PassengerType }) => p.type)).toEqual(['adult', 'adult', 'infant']);
      expect(releaseCalls()).toHaveLength(0);

      expect(result.reference).toBeNull(); // shown only once Confirmed
      expect(result).toMatchObject({
        status: BookingStatus.PENDING_PAYMENT,
        fareTotal: 94500,
        baggageFee: 5000,
        total: 99500,
        holdExpiresAt: '2026-11-19T12:10:00.000Z',
      });
      expect(result.segments[0]).toMatchObject({
        flightNumber: 'MS 123',
        departure: { iataCode: 'CAI', localTime: '2026-12-01T10:00', timeZone: 'Africa/Cairo' },
        arrival: { iataCode: 'JFK', localTime: '2026-12-01T14:30' },
        seatPrice: 45000,
        infantPrice: 4500,
        seatedPassengers: 2,
        infants: 1,
        fare: 94500,
      });
      expect(result.passengers.map((p) => [p.type, p.seats])).toEqual([
        ['adult', [{ segment: 0, seat: '10A' }]],
        ['adult', [{ segment: 0, seat: '10B' }]],
        ['infant', []],
      ]);
    });

    it('books a round trip as one booking with two segments and charges bags on each flight', async () => {
      flightModel.findOneAndUpdate.mockImplementation(() => query({ _id: new Types.ObjectId() }));
      const result = await service.create(userId, roundTrip([adult('A1234567', [20, 15])]));

      expect(holdCalls().map(([filter]) => filter._id)).toEqual([outbound._id, inbound._id]);
      expect(savedBooking()).toMatchObject({
        name: 'MS 123 CAI -> JFK, MS 124 JFK -> CAI',
        fareTotal: 90000,
        baggageFee: 2 * 5000 * 2,
      });
      expect(result.segments).toHaveLength(2);
      expect(result.passengers[0].seats).toEqual([
        { segment: 0, seat: '10A' },
        { segment: 1, seat: '10A' },
      ]);
    });

    it('works out passenger types on the local outbound departure date', async () => {
      // Departs 2026-12-01 00:30 Cairo time = 2026-11-30 22:30 UTC; born 2014-12-01 -> 12 on the local date
      outbound = flightFrom(cai, jfk, '2026-11-30T22:30:00Z', '2026-12-01T09:00:00Z');
      await service.create(userId, oneWay([{ ...adult(), dateOfBirth: '2014-12-01' }]));
      expect(savedBooking().passengers[0].type).toBe(PassengerType.ADULT);
    });

    it.each([
      ['no adult', [{ ...adult(), dateOfBirth: '2020-01-01' }], /at least one adult/],
      ['more infants than adults', [adult(), infant, { ...infant, passportNumber: 'D1234567' }], /2 infant\(s\) but only 1 adult/],
      ['a duplicate passport', [adult('A1234567'), adult('a1234567')], /used for more than one passenger/],
      ['too many extra bags', [adult('A1234567', [10, 10, 10])], /at most 2 per passenger/],
      ['a bag over the flight limit', [adult('A1234567', [40])], /over the 32 kg limit/],
    ])('rejects %s without holding seats', async (_case, passengers, message) => {
      await expect(service.create(userId, oneWay(passengers))).rejects.toThrow(message);
      expect(holdCalls()).toHaveLength(0);
      expect(bookingModel.create).not.toHaveBeenCalled();
    });

    it('rejects a return flight that is not the reverse route', async () => {
      inbound = flightFrom(jfk, jfk, '2026-12-10T22:00:00Z', '2026-12-11T15:00:00Z');
      await expect(service.create(userId, roundTrip())).rejects.toThrow(/reverse route/);
      expect(holdCalls()).toHaveLength(0);
    });

    it('rejects a return flight that departs before the outbound flight arrives', async () => {
      inbound = flightFrom(jfk, cai, '2026-12-01T19:00:00Z', '2026-12-02T09:00:00Z');
      await expect(service.create(userId, roundTrip())).rejects.toThrow(/depart after the outbound flight arrives/);
    });

    it('rejects the same flight twice', async () => {
      const dto = oneWay();
      dto.segments.push({ flightId: dto.segments[0].flightId, cabinName: dto.segments[0].cabinName });
      await expect(service.create(userId, dto)).rejects.toThrow(BadRequestException);
    });

    it('404s on an unknown flight', async () => {
      flightModel.find.mockImplementation(() => query([]));
      await expect(service.create(userId, oneWay())).rejects.toThrow(NotFoundException);
    });

    it.each([
      ['cancelled', { status: FlightStatus.CANCELLED }, /is cancelled/],
      ['departed', { departure: { airportId: cai._id, timestamp: new Date('2026-11-19T11:00:00Z') } }, /is departed/],
    ])('409s on a %s flight', async (_case, overrides, message) => {
      outbound = flightFrom(cai, jfk, '2026-12-01T08:00:00Z', '2026-12-01T19:30:00Z', overrides);
      await expect(service.create(userId, oneWay())).rejects.toThrow(message);
    });

    it('409s when the airline is not active', async () => {
      airlineModel.find.mockImplementation(() => query([{ ...airline, status: ProviderStatus.DEACTIVATED }]));
      await expect(service.create(userId, oneWay())).rejects.toThrow(/airline .* is not active/);
    });

    it('400s when the flight has no such cabin', async () => {
      const dto = oneWay();
      dto.segments[0].cabinName = CabinType.FIRST;
      await expect(service.create(userId, dto)).rejects.toThrow(/has no First cabin/);
    });

    it('409s when the cabin has fewer available seats than needed', async () => {
      outbound.cabins[0].seats = generateSeats(10, 10, 'A');
      await expect(service.create(userId, oneWay([adult('A1234567'), adult('B1234567')]))).rejects.toThrow(
        /2 needed, 1 available/,
      );
      expect(holdCalls()).toHaveLength(0);
    });

    it('retries with new, randomly picked seats after losing a race', async () => {
      // Another booking took 10A between our read and our write
      const reread = flightFrom(cai, jfk, '2026-12-01T08:00:00Z', '2026-12-01T19:30:00Z', { _id: outbound._id });
      reread.cabins[0].seats[0].availability = SeatAvailability.HELD;
      flightModel.findById.mockImplementation(() => query(reread));
      flightModel.findOneAndUpdate.mockImplementationOnce(() => query(null));
      const random = vi.fn(() => 0);
      service.random = random;

      await service.create(userId, oneWay());

      expect(random).toHaveBeenCalled(); // the first pick is deterministic, the retry is random
      expect(holdCalls()).toHaveLength(2);
      expect(holdCalls()[1][2].arrayFilters[1].$or).toEqual([
        { 'seat.row': 10, 'seat.column': 'B', 'seat.availability': SeatAvailability.AVAILABLE },
      ]);
      expect(savedBooking().segments[0].seats).toEqual([{ passengerIndex: 0, row: 10, column: 'B' }]);
    });

    it('succeeds on the last of the 5 retries', async () => {
      for (let i = 0; i < 5; i += 1) flightModel.findOneAndUpdate.mockImplementationOnce(() => query(null));
      await service.create(userId, oneWay());
      expect(holdCalls()).toHaveLength(6);
      expect(bookingModel.create).toHaveBeenCalledTimes(1);
    });

    it('409s after losing the race on the first try and all 5 retries, without saving', async () => {
      flightModel.findOneAndUpdate.mockImplementation(() => query(null));
      await expect(service.create(userId, oneWay())).rejects.toThrow(/taken by other bookings at the same time/);
      expect(holdCalls()).toHaveLength(6);
      expect(bookingModel.create).not.toHaveBeenCalled();
    });

    it('releases the outbound seats when the return flight has no seats left', async () => {
      inbound.cabins[0].seats.forEach((seat) => (seat.availability = SeatAvailability.BOOKED));
      await expect(service.create(userId, roundTrip())).rejects.toThrow(ConflictException);

      expect(releaseCalls()).toHaveLength(1);
      const [filter, update, options] = releaseCalls()[0];
      expect(filter).toEqual({ _id: outbound._id });
      expect(update).toEqual({ $set: { 'cabins.$[cabin].seats.$[seat].availability': SeatAvailability.AVAILABLE } });
      // Only seats still held are given back
      expect(options.arrayFilters).toEqual([
        { 'cabin.name': 'Economy' },
        { $or: [{ 'seat.row': 10, 'seat.column': 'A', 'seat.availability': SeatAvailability.HELD }] },
      ]);
      expect(bookingModel.create).not.toHaveBeenCalled();
    });

    it('releases every held seat when saving the booking fails', async () => {
      flightModel.findOneAndUpdate.mockImplementation(() => query({ _id: new Types.ObjectId() }));
      bookingModel.create.mockRejectedValue(new Error('write failed'));

      await expect(service.create(userId, roundTrip())).rejects.toThrow('write failed');
      expect(releaseCalls().map(([filter]) => filter._id)).toEqual([outbound._id, inbound._id]);
    });

    it('tries a new reference when the random one is already taken', async () => {
      bookingModel.create.mockRejectedValueOnce(Object.assign(new Error('E11000'), { code: 11000, keyPattern: { reference: 1 } }));
      await service.create(userId, oneWay());
      expect(bookingModel.create).toHaveBeenCalledTimes(2);
      expect(releaseCalls()).toHaveLength(0);
    });

    it('expires overdue holds on the requested flights before picking seats', async () => {
      await service.create(userId, oneWay());
      expect(bookingModel.find.mock.calls[0][0]).toMatchObject({
        status: BookingStatus.PENDING_PAYMENT,
        holdExpiresAt: { $lte: NOW },
        'segments.flightId': { $in: [outbound._id] },
      });
    });
  });

  describe('listForUser and findOneForUser (FLT-25)', () => {
    const storedBooking = (status: BookingStatus, overrides: Record<string, unknown> = {}) => ({
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      reference: 'K7M2QX',
      status,
      segments: [{ flightId: outbound._id, cabinName: CabinType.ECONOMY, seatPrice: 45000, seats: [{ passengerIndex: 0, row: 10, column: 'A' }] }],
      passengers: [{ fullName: 'Mona Hassan', dateOfBirth: new Date('1990-05-31T00:00:00Z'), type: PassengerType.ADULT, passportNumber: 'A1234567', extraBagWeights: [] }],
      fareTotal: 45000,
      baggageFee: 0,
      holdExpiresAt: null,
      ...overrides,
    });

    it('expires overdue holds for this user, then returns each group with its page and total', async () => {
      const upcoming = storedBooking(BookingStatus.PENDING_PAYMENT);
      const past = storedBooking(BookingStatus.COMPLETED);
      const expired = storedBooking(BookingStatus.EXPIRED);
      bookingModel.aggregate = vi.fn(() => query([
        { upcoming: [upcoming], upcomingTotal: [{ count: 1 }], past: [past], pastTotal: [{ count: 13 }], cancelled: [expired], cancelledTotal: [{ count: 1 }] },
      ]));

      const result = await service.listForUser(userId, { pastPage: 2 });

      // Lazy expiry first, scoped to the user
      expect(bookingModel.find.mock.calls[0][0]).toMatchObject({ status: BookingStatus.PENDING_PAYMENT, userId: new Types.ObjectId(userId) });
      expect(bookingModel.find.mock.invocationCallOrder[0]).toBeLessThan(bookingModel.aggregate.mock.invocationCallOrder[0]);
      // The pipeline gets this user and the requested page per group
      const pipeline = bookingModel.aggregate.mock.calls[0][0];
      expect(pipeline[0].$match.userId).toEqual(new Types.ObjectId(userId));
      expect(pipeline.at(-1).$facet.past[2]).toEqual({ $skip: 10 });

      expect(result.upcoming).toMatchObject({ page: 1, pageSize: 10, total: 1 });
      expect(result.past).toMatchObject({ page: 2, pageSize: 10, total: 13 });
      expect(result.cancelled).toMatchObject({ page: 1, pageSize: 10, total: 1 });
      expect(result.upcoming.items[0]).toMatchObject({ id: upcoming._id.toString(), status: 'pending payment', reference: null });
      expect(result.past.items[0]).toMatchObject({ status: 'completed', reference: 'K7M2QX' });
      expect(result.cancelled.items[0]).toMatchObject({ status: 'expired', reference: null });
      expect(result.upcoming.items[0].segments[0]).toMatchObject({ flightNumber: 'MS 123', departure: { iataCode: 'CAI' } });
    });

    it('returns empty groups when the user has no bookings', async () => {
      bookingModel.aggregate = vi.fn(() => query([{ upcoming: [], upcomingTotal: [], past: [], pastTotal: [], cancelled: [], cancelledTotal: [] }]));
      const result = await service.listForUser(userId, {});
      for (const group of [result.upcoming, result.past, result.cancelled]) {
        expect(group).toEqual({ items: [], page: 1, pageSize: 10, total: 0 });
      }
    });

    it('returns one of the user\'s bookings with the summary shape, reference shown once Confirmed', async () => {
      const confirmed = storedBooking(BookingStatus.CONFIRMED);
      bookingModel.findOne = vi.fn(() => query(confirmed));

      const result = await service.findOneForUser(userId, confirmed._id.toString());

      expect(bookingModel.findOne.mock.calls[0][0]).toEqual({ _id: confirmed._id.toString(), userId: new Types.ObjectId(userId) });
      expect(result).toMatchObject({ id: confirmed._id.toString(), reference: 'K7M2QX', status: 'confirmed', fareTotal: 45000, total: 45000 });
      expect(result.passengers[0]).toMatchObject({ type: 'adult', dateOfBirth: '1990-05-31', seats: [{ segment: 0, seat: '10A' }] });
    });

    it('hides the reference of a Pending Payment booking', async () => {
      bookingModel.findOne = vi.fn(() => query(storedBooking(BookingStatus.PENDING_PAYMENT)));
      const result = await service.findOneForUser(userId, new Types.ObjectId().toString());
      expect(result.reference).toBeNull();
    });

    it("404s (not 403) for someone else's booking", async () => {
      // The query filters on the user, so another user's booking simply isn't found
      bookingModel.findOne = vi.fn(() => query(null));
      await expect(service.findOneForUser(userId, new Types.ObjectId().toString())).rejects.toThrow(NotFoundException);
    });

    it('404s for a malformed id without querying', async () => {
      bookingModel.findOne = vi.fn();
      await expect(service.findOneForUser(userId, 'not-an-id')).rejects.toThrow(NotFoundException);
      expect(bookingModel.findOne).not.toHaveBeenCalled();
    });
  });

  describe('expireOverdueHolds', () => {
    const overdueBooking = {
      _id: new Types.ObjectId(),
      segments: [{ flightId: new Types.ObjectId(), cabinName: CabinType.ECONOMY, seatPrice: 45000, seats: [{ passengerIndex: 0, row: 12, column: 'C' }] }],
    };

    it('expires a booking whose hold ran out and releases its seats', async () => {
      bookingModel.find.mockImplementation(() => query([{ _id: overdueBooking._id }]));
      bookingModel.findOneAndUpdate.mockImplementation(() => query(overdueBooking));

      await expect(service.expireOverdueHolds()).resolves.toBe(1);

      const [filter, update] = bookingModel.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({ _id: overdueBooking._id, status: BookingStatus.PENDING_PAYMENT, holdExpiresAt: { $lte: NOW } });
      expect(update).toEqual({ $set: { status: BookingStatus.EXPIRED } });
      expect(releaseCalls()).toHaveLength(1);
      expect(releaseCalls()[0][0]).toEqual({ _id: overdueBooking.segments[0].flightId });
    });

    it('leaves the seats alone when another caller expired or confirmed the booking first', async () => {
      bookingModel.find.mockImplementation(() => query([{ _id: overdueBooking._id }]));
      bookingModel.findOneAndUpdate.mockImplementation(() => query(null));

      await expect(service.expireOverdueHolds()).resolves.toBe(0);
      expect(releaseCalls()).toHaveLength(0);
    });
  });

  describe('selectSeat (FLT-28)', () => {
    const bookingWithSeats = (status = BookingStatus.CONFIRMED) => ({
      _id: new Types.ObjectId(),
      userId: new Types.ObjectId(userId),
      reference: 'K7M2QX',
      status,
      segments: [
        {
          flightId: outbound._id,
          cabinName: CabinType.ECONOMY,
          seatPrice: 45000,
          seats: [{ passengerIndex: 0, row: 10, column: 'A' }],
        },
      ],
      passengers: [
        {
          fullName: 'Mona Hassan',
          dateOfBirth: new Date('1990-05-31T00:00:00Z'),
          type: PassengerType.ADULT,
          passportNumber: 'A1234567',
          extraBagWeights: [],
        },
        {
          fullName: 'Baby Hassan',
          dateOfBirth: new Date('2026-01-15T00:00:00Z'),
          type: PassengerType.INFANT,
          passportNumber: 'C1234567',
          extraBagWeights: [],
        },
      ],
      fareTotal: 49500,
      baggageFee: 0,
      cost: 49500,
      holdExpiresAt: status === BookingStatus.PENDING_PAYMENT ? new Date('2026-11-19T12:10:00Z') : null,
      pendingChange: null,
    });

    it('atomically reserves a new available seat, updates the booking and releases the old seat', async () => {
      const booking = bookingWithSeats(BookingStatus.CONFIRMED);
      bookingModel.findOne = vi.fn(() => query(booking));
      bookingModel.findOneAndUpdate = vi.fn((_filter, update: { $set: Record<string, unknown> }) =>
        query({
          ...booking,
          segments: [{ ...booking.segments[0], seats: update.$set['segments.0.seats'] }],
        }),
      );

      const result = await service.selectSeat(userId, booking._id.toString(), {
        segmentIndex: 0,
        passengerIndex: 0,
        seat: '11C',
      });

      expect(result.passengers[0].seats).toEqual([{ segment: 0, seat: '11C' }]);
      expect(holdCalls()).toHaveLength(1);
      expect(holdCalls()[0][1]).toEqual({
        $set: { 'cabins.$[cabin].seats.$[seat].availability': SeatAvailability.BOOKED },
      });
      expect(releaseCalls()).toHaveLength(1);
      expect(releaseCalls()[0][2]).toEqual({
        arrayFilters: [
          { 'cabin.name': CabinType.ECONOMY },
          { $or: [{ 'seat.row': 10, 'seat.column': 'A', 'seat.availability': SeatAvailability.BOOKED }] },
        ],
      });
    });

    it('rejects assigning a seat to an infant or selecting a seat outside the booked cabin', async () => {
      const booking = bookingWithSeats(BookingStatus.CONFIRMED);
      bookingModel.findOne = vi.fn(() => query(booking));

      await expect(
        service.selectSeat(userId, booking._id.toString(), { passengerIndex: 1, seat: '11B' }),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.selectSeat(userId, booking._id.toString(), { passengerIndex: 0, seat: '1A' }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects selecting an already occupied seat with 409', async () => {
      const booking = bookingWithSeats(BookingStatus.CONFIRMED);
      bookingModel.findOne = vi.fn(() => query(booking));
      const seat11B = outbound.cabins[0].seats.find((s) => s.row === 11 && s.column === 'B')!;
      seat11B.availability = SeatAvailability.BOOKED;

      await expect(
        service.selectSeat(userId, booking._id.toString(), { passengerIndex: 0, row: 11, column: 'B' }),
      ).rejects.toThrow(ConflictException);
    });
  });
});
