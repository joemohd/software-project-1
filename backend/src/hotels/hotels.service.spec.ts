import { ConflictException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import type { Model, Types } from 'mongoose';
import { BookingStatus } from '../database/schemas/expense.schema.js';
import {
  ProviderStatus,
  RoomStatus,
} from '../database/schemas/provider.schema.js';
import { HotelsService } from './hotels.service.js';

const hotelId = '507f1f77bcf86cd799439011';
const roomId = '507f1f77bcf86cd799439012';
const roomTypeId = '507f1f77bcf86cd799439013';
const user = {
  id: '507f1f77bcf86cd799439014',
  role: 'hotel moderator',
  status: 'active',
  isVerified: true,
} as const;

function query<T>(value: T) {
  return { exec: vi.fn().mockResolvedValue(value) };
}

function hotel() {
  return {
    _id: objectId(hotelId),
    moderatorId: objectId(user.id),
    status: ProviderStatus.ACTIVE,
    name: 'Nile View',
    description: 'Hotel',
    address: '1 Corniche',
    cityId: objectId('507f1f77bcf86cd799439015'),
    imageUrls: [],
    starClass: 4,
    amenities: [],
    checkingPolicy: { checkInTime: 840, checkOutTime: 660 },
    cancellationPolicies: [],
    averageRating: 0,
    save: vi.fn().mockResolvedValue(undefined),
  };
}

function room(
  availability = [
    {
      startDate: new Date('2026-12-01T00:00:00.000Z'),
      endDate: new Date('2026-12-05T00:00:00.000Z'),
    },
  ],
) {
  return {
    _id: objectId(roomId),
    hotelId: objectId(hotelId),
    roomTypeId: objectId(roomTypeId),
    number: 101,
    bedCount: 1,
    maxOccupancy: 2,
    pricePerNight: 100,
    status: RoomStatus.ACTIVE,
    availability,
    blockedDates: [],
    save: vi.fn().mockResolvedValue(undefined),
    deleteOne: vi.fn().mockResolvedValue(undefined),
  };
}

function objectId(value: string) {
  return { toString: () => value } as Types.ObjectId;
}

function serviceWith({
  hotelDoc = hotel(),
  roomDoc = room(),
  bookings = [] as unknown[],
} = {}) {
  const hotelModel = {
    findById: vi.fn().mockReturnValue(query(hotelDoc)),
  };
  const roomModel = {
    findOne: vi.fn().mockReturnValue(query(roomDoc)),
  };
  const roomTypeModel = {
    findById: vi.fn().mockReturnValue(query({ name: 'Double' })),
  };
  const bookingModel = {
    find: vi.fn().mockReturnValue(query(bookings)),
    countDocuments: vi.fn().mockReturnValue(query(0)),
  };

  return {
    service: new HotelsService(
      hotelModel as unknown as Model<never>,
      roomModel as unknown as Model<never>,
      roomTypeModel as unknown as Model<never>,
      bookingModel as unknown as Model<never>,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    ),
    hotelDoc,
    roomDoc,
  };
}

describe('HotelsService room management', () => {
  it('rejects an availability period that overlaps an existing one (HTL-04)', async () => {
    const { service, roomDoc } = serviceWith();

    await expect(
      service.addAvailability(hotelId, roomId, user, {
        startDate: '2026-12-04',
        endDate: '2026-12-07',
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(roomDoc.save).not.toHaveBeenCalled();
  });

  it('does not let availability be removed from a protected reservation (HTL-05)', async () => {
    const protectedBooking = {
      _id: objectId('507f1f77bcf86cd799439016'),
      status: BookingStatus.CONFIRMED,
      startDate: new Date('2026-12-02T00:00:00.000Z'),
      nightsCount: 2,
      rooms: [{ roomId: objectId(roomId) }],
    };
    const { service, roomDoc } = serviceWith({ bookings: [protectedBooking] });

    await expect(
      service.updateRoom(hotelId, roomId, user, {
        availability: [{ startDate: '2026-12-01', endDate: '2026-12-02' }],
      }),
    ).rejects.toBeInstanceOf(ConflictException);

    expect(roomDoc.save).not.toHaveBeenCalled();
  });

  it('stores cancellation tiers in ascending threshold order (HTL-09/HTL-10)', async () => {
    const { service, hotelDoc } = serviceWith();

    const result = await service.updatePolicies(hotelId, user, {
      checkInTime: '14:00',
      checkOutTime: '11:00',
      cancellationTiers: [
        { daysBeforeCheckIn: 7, refundPercentage: 75 },
        { daysBeforeCheckIn: 0, refundPercentage: 0 },
      ],
    });

    expect(hotelDoc.cancellationPolicies).toEqual([
      { daysBeforeService: { startDay: 0, endDay: 7 }, refundPercentage: 0 },
      {
        daysBeforeService: { startDay: 7, endDay: null },
        refundPercentage: 75,
      },
    ]);
    expect(result.cancellationTiers).toEqual([
      { daysBeforeCheckIn: 0, refundPercentage: 0 },
      { daysBeforeCheckIn: 7, refundPercentage: 75 },
    ]);
    expect(hotelDoc.save).toHaveBeenCalledOnce();
  });
});
