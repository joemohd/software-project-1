import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { BookingStatus, PassengerType } from '../database/schemas/expense.schema.js';
import { CabinType, FlightStatus, SeatAvailability } from '../database/schemas/flight.schema.js';
import { generateSeats } from './cabin-seats.js';
import { FlightManifestService } from './flight-manifest.service.js';

/** Mimics a chainable mongoose query resolved by exec(). */
const query = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = { exec: vi.fn().mockResolvedValue(result) };
  for (const method of ['select', 'lean', 'sort', 'skip', 'limit']) q[method] = vi.fn().mockReturnValue(q);
  return q;
};

describe('FlightManifestService (FLT-29)', () => {
  const moderatorId = new Types.ObjectId().toString();
  const airlineId = new Types.ObjectId();
  const cityId = new Types.ObjectId();
  const flightId = new Types.ObjectId();
  const economy = generateSeats(10, 11, 'AB'); // 4 seats
  economy[0].availability = SeatAvailability.BOOKED;
  economy[1].availability = SeatAvailability.HELD;
  const flight = {
    _id: flightId,
    airlineId,
    number: '123',
    status: FlightStatus.SCHEDULED,
    // 2026-12-19 23:30 UTC = 2026-12-20 01:30 in Cairo
    departure: { airportId: new Types.ObjectId(), timestamp: new Date('2026-12-19T23:30:00Z') },
    arrival: { airportId: new Types.ObjectId(), timestamp: new Date('2026-12-20T11:00:00Z') },
    maxBagWeight: 32,
    cabins: [
      { name: CabinType.BUSINESS, seatPrice: 150000, freeBagWeight: 32, seats: generateSeats(1, 1, 'AB') },
      { name: CabinType.ECONOMY, seatPrice: 45000, freeBagWeight: 23, seats: economy },
    ],
  };
  const booking = (reference: string, status: BookingStatus, fullName = 'Mona Hassan') => ({
    _id: new Types.ObjectId(),
    reference,
    status,
    segments: [{ flightId, cabinName: CabinType.ECONOMY, seats: [{ passengerIndex: 0, row: 10, column: 'A' }] }],
    passengers: [{ fullName, type: PassengerType.ADULT, extraBagWeights: [20] }],
  });

  let bookingModel: Record<string, ReturnType<typeof vi.fn>>;
  let flightModel: Record<string, ReturnType<typeof vi.fn>>;
  let airlinesService: { findOwnedAirline: ReturnType<typeof vi.fn> };
  let service: FlightManifestService;

  beforeEach(() => {
    flightModel = { findById: vi.fn(() => query(flight)) };
    bookingModel = {
      find: vi.fn(() => query([booking('AAAAAA', BookingStatus.CONFIRMED), booking('BBBBBB', BookingStatus.CANCELLED)])),
      countDocuments: vi.fn(() => query(12)),
    };
    airlinesService = { findOwnedAirline: vi.fn().mockResolvedValue({ _id: airlineId, moderatorId }) };
    service = new FlightManifestService(
      flightModel as never,
      bookingModel as never,
      { findById: vi.fn(() => query({ iataCode: 'MS' })) } as never,
      { findById: vi.fn(() => query({ cityId })) } as never,
      { findById: vi.fn(() => query({ timeZone: 'Africa/Cairo' })) } as never,
      airlinesService as never,
    );
  });

  describe('listBookings', () => {
    it('returns Confirmed and Cancelled bookings on the flight, paged, with seats remaining per cabin', async () => {
      const result = await service.listBookings(flightId.toString(), moderatorId, { page: 2 });

      const [filter] = bookingModel.find.mock.calls[0];
      expect(filter).toEqual({ 'segments.flightId': flightId, status: { $in: ['confirmed', 'cancelled'] } });
      const findQuery = bookingModel.find.mock.results[0].value;
      expect(findQuery.sort).toHaveBeenCalledWith({ createdAt: -1, _id: -1 });
      expect(findQuery.skip).toHaveBeenCalledWith(10);
      expect(findQuery.limit).toHaveBeenCalledWith(10);
      // Passport numbers are never read
      expect(findQuery.select.mock.calls[0][0]).not.toContain('passportNumber');
      expect(bookingModel.countDocuments).toHaveBeenCalledWith(filter);

      expect(result).toMatchObject({ flightId: flightId.toString(), page: 2, pageSize: 10, total: 12 });
      expect(result.cabins).toEqual([
        { name: 'Business', seatCount: 2, availableSeats: 2 },
        { name: 'Economy', seatCount: 4, availableSeats: 2 }, // 1 booked + 1 held don't count
      ]);
      expect(result.items[0]).toEqual({
        id: expect.any(String),
        reference: 'AAAAAA',
        status: 'confirmed',
        cabinName: 'Economy',
        passengers: [{ fullName: 'Mona Hassan', type: 'adult', seat: '10A', extraBagWeights: [20] }],
      });
      expect(result.items[1].status).toBe('cancelled');
    });

    it('checks ownership through the airline of the flight', async () => {
      await service.listBookings(flightId.toString(), moderatorId, {});
      expect(airlinesService.findOwnedAirline).toHaveBeenCalledWith(airlineId.toString(), moderatorId);
    });

    it('404s on an unknown or malformed flight id', async () => {
      flightModel.findById.mockImplementation(() => query(null));
      await expect(service.listBookings(new Types.ObjectId().toString(), moderatorId, {})).rejects.toThrow(NotFoundException);
      await expect(service.listBookings('nope', moderatorId, {})).rejects.toThrow(NotFoundException);
    });

    it("403s on another airline's flight, without reading bookings", async () => {
      airlinesService.findOwnedAirline.mockRejectedValue(new ForbiddenException('You can only manage your own airline.'));
      await expect(service.listBookings(flightId.toString(), moderatorId, {})).rejects.toThrow(ForbiddenException);
      expect(bookingModel.find).not.toHaveBeenCalled();
    });
  });

  describe('exportPassengers', () => {
    it('returns every passenger as CSV, oldest booking first, with a filename from the local departure date', async () => {
      bookingModel.find.mockImplementation(() =>
        query([booking('AAAAAA', BookingStatus.CONFIRMED, '=HYPERLINK("http://evil.test")'), booking('BBBBBB', BookingStatus.CANCELLED)]),
      );

      const { filename, csv } = await service.exportPassengers(flightId.toString(), moderatorId);

      const findQuery = bookingModel.find.mock.results[0].value;
      expect(findQuery.sort).toHaveBeenCalledWith({ createdAt: 1, _id: 1 });
      expect(findQuery.skip).not.toHaveBeenCalled(); // not paginated
      expect(filename).toBe('MS123-2026-12-20-passengers.csv');
      expect(csv.split('\r\n')).toEqual([
        '﻿Reference,Passenger name,Type,Cabin,Seat,Extra bags,Status',
        'AAAAAA,"\'=HYPERLINK(""http://evil.test"")",adult,Economy,10A,1,confirmed',
        'BBBBBB,Mona Hassan,adult,Economy,10A,1,cancelled',
        '',
      ]);
    });

    it("403s on another airline's flight", async () => {
      airlinesService.findOwnedAirline.mockRejectedValue(new ForbiddenException());
      await expect(service.exportPassengers(flightId.toString(), moderatorId)).rejects.toThrow(ForbiddenException);
    });
  });
});
