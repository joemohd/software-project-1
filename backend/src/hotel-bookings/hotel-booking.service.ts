import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { type Connection, type Model, Types } from 'mongoose';
import { City } from '../database/schemas/city.schema.js';
import { BookingStatus, HotelBooking, PaymentIntentStatus } from '../database/schemas/expense.schema.js';
import { Hotel, ProviderStatus, Room, RoomStatus, RoomType } from '../database/schemas/provider.schema.js';
import { StripeService } from '../payments/stripe.service.js';
import { CreateHotelBookingDto } from './dto/create-hotel-booking.dto.js';
import { HotelBookingResponseDto } from './dto/hotel-booking-response.dto.js';
import { ADULT_AGE, HOTEL_HOLD_MINUTES, HOTEL_HOLD_SWEEP_BATCH_SIZE } from './hotel-booking.constants.js';
import {
  assertGuests,
  assertOccupancy,
  guestAges,
  parseStay,
  rangesOverlap,
  bookingRange,
  stayTotal,
} from './hotel-booking-rules.js';

type HotelRecord = Pick<Hotel, 'name' | 'status' | 'cityId'> & { _id: Types.ObjectId };
type RoomRecord = Room & { _id: Types.ObjectId };
type HotelBookingRecord = HotelBooking & { _id: Types.ObjectId };

const HOTEL_NOT_FOUND = 'Hotel not found.';
const MAX_NAME_LENGTH = 100;

/**
 * HTL-16, HTL-18: creates hotel bookings. All selected rooms are held together for 10 minutes as one Pending Payment
 * booking, or nothing is held. Payment (PAY-01) and confirmation (HTL-17) are done by the payments module.
 */
@Injectable()
export class HotelBookingService {
  private readonly logger = new Logger(HotelBookingService.name);

  constructor(
    @InjectModel(HotelBooking.name) private readonly hotelBookingModel: Model<HotelBooking>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(RoomType.name) private readonly roomTypeModel: Model<RoomType>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectConnection() private readonly connection: Connection,
    private readonly stripeService: StripeService,
  ) {}

  /**
   * HTL-16, HTL-18: books one or more rooms of one hotel for the same dates. Guests are assigned per room (adults, and
   * children aged 0-17) with at least one adult in the booking and no room over its maximum occupancy. The total is
   * the sum over rooms of nights x that room's current price per night.
   *
   * Availability is checked and the hold is saved in one MongoDB transaction that first writes to every selected room.
   * Two requests for the same room therefore conflict: MongoDB aborts one, Mongoose retries it, and the retry sees the
   * other hold and is rejected. So a room is never held twice for overlapping dates, and when any room is not free the
   * whole request is rejected and nothing is held.
   */
  async create(userId: string, dto: CreateHotelBookingDto): Promise<HotelBookingResponseDto> {
    assertGuests(dto.rooms);

    const hotel = await this.hotelModel.findById(dto.hotelId).select('name status cityId').lean<HotelRecord>().exec();
    if (!hotel || hotel.status !== ProviderStatus.ACTIVE) throw new NotFoundException(HOTEL_NOT_FOUND);
    // HTL-18: "check-in not in the past" uses the hotel's local date
    const city = await this.cityModel.findById(hotel.cityId).select('timeZone').lean<{ timeZone?: string }>().exec();
    const today = DateTime.now().setZone(city?.timeZone ?? 'UTC').toISODate() ?? DateTime.utc().toISODate()!;
    const stay = parseStay(dto.checkIn, dto.checkOut, today);

    const roomIds = dto.rooms.map((room) => new Types.ObjectId(room.roomId));
    const rooms = await this.roomModel.find({ _id: { $in: roomIds }, hotelId: hotel._id }).lean<RoomRecord[]>().exec();
    const roomById = new Map(rooms.map((room) => [room._id.toString(), room]));
    for (const guests of dto.rooms) {
      const room = roomById.get(guests.roomId);
      if (!room) throw new NotFoundException(`Room ${guests.roomId} not found in this hotel.`);
      if (room.status !== RoomStatus.ACTIVE) throw new ConflictException(`Room ${room.number} is not available for booking.`);
      assertOccupancy(guests, room);
    }

    // Holds that ran out no longer block these rooms
    await this.expireOverdueHolds({ roomIds });

    const prices = dto.rooms.map((guests) => roomById.get(guests.roomId)!.pricePerNight);
    const total = stayTotal(prices, stay.nights);
    const name = `${hotel.name}, ${stay.nights} night${stay.nights === 1 ? '' : 's'}`.slice(0, MAX_NAME_LENGTH);

    const booking = await this.connection.transaction(async (session) => {
      // Write to each room first: concurrent transactions on the same room now conflict (see above)
      const now = new Date();
      await this.roomModel.updateMany({ _id: { $in: roomIds } }, { $set: { updatedAt: now } }, { session, timestamps: false }).exec();

      // Re-read inside the transaction: blocked dates or status may have changed since the first read
      const current = await this.roomModel.find({ _id: { $in: roomIds } }).session(session).lean<RoomRecord[]>().exec();
      for (const room of current) {
        if (room.status !== RoomStatus.ACTIVE) throw new ConflictException(`Room ${room.number} is not available for booking.`);
        if ((room.blockedDates ?? []).some((range) => rangesOverlap(range, stay))) {
          throw new ConflictException(`Room ${room.number} is blocked by the hotel for some of these dates. Nothing was held.`);
        }
      }

      // HTL-18: a Confirmed booking or an unexpired hold on any of these rooms for overlapping dates rejects the request
      const candidates = await this.hotelBookingModel
        .find({
          'rooms.roomId': { $in: roomIds },
          startDate: { $lt: stay.endDate },
          $or: [
            { status: BookingStatus.CONFIRMED },
            { status: BookingStatus.PENDING_PAYMENT, holdExpiresAt: { $gt: now } },
            { status: BookingStatus.PENDING_PAYMENT, holdExpiresAt: null },
          ],
        })
        .select('startDate nightsCount rooms')
        .session(session)
        .lean<Pick<HotelBookingRecord, '_id' | 'startDate' | 'nightsCount' | 'rooms'>[]>()
        .exec();
      const taken = new Set(
        candidates
          .filter((booking) => rangesOverlap(bookingRange(booking), stay))
          .flatMap((booking) => booking.rooms.map((room) => room.roomId.toString())),
      );
      const clashing = current.filter((room) => taken.has(room._id.toString())).map((room) => room.number);
      if (clashing.length) {
        throw new ConflictException(`Room${clashing.length === 1 ? '' : 's'} ${clashing.join(', ')} already booked for these dates. Nothing was held.`);
      }

      const [created] = await this.hotelBookingModel.create(
        [
          {
            userId: new Types.ObjectId(userId),
            expenseType: 'hotel_booking',
            name,
            cost: total,
            status: BookingStatus.PENDING_PAYMENT,
            startDate: stay.startDate,
            nightsCount: stay.nights,
            holdExpiresAt: new Date(Date.now() + HOTEL_HOLD_MINUTES * 60_000),
            rooms: dto.rooms.map((guests, index) => ({
              roomId: roomIds[index],
              pricePerNight: prices[index],
              guestAges: guestAges(guests),
            })),
          },
        ],
        { session },
      );
      return created.toObject() as HotelBookingRecord;
    });

    return this.toResponse(booking, hotel, roomById);
  }

  /**
   * HTL-18: Pending Payment bookings whose hold ran out become Expired, which releases their rooms, and their
   * PaymentIntent is cancelled (PAY-01). The status change is guarded, so a booking confirmed by payment in the
   * meantime is left alone and racing callers expire it once.
   */
  async expireOverdueHolds(scope: { roomIds?: Types.ObjectId[]; userId?: Types.ObjectId } = {}): Promise<number> {
    const overdue = { status: BookingStatus.PENDING_PAYMENT, holdExpiresAt: { $lte: new Date() } };
    const candidates = await this.hotelBookingModel
      .find({
        ...overdue,
        ...(scope.roomIds ? { 'rooms.roomId': { $in: scope.roomIds } } : {}),
        ...(scope.userId ? { userId: scope.userId } : {}),
      })
      .select('_id')
      .limit(HOTEL_HOLD_SWEEP_BATCH_SIZE)
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();

    let expired = 0;
    for (const { _id } of candidates) {
      const booking = await this.hotelBookingModel
        .findOneAndUpdate({ _id, ...overdue }, { $set: { status: BookingStatus.EXPIRED } }, { returnDocument: 'after' })
        .select('payment')
        .lean<Pick<HotelBookingRecord, '_id' | 'payment'>>()
        .exec();
      if (!booking) continue;
      if (booking.payment && booking.payment.status !== PaymentIntentStatus.SUCCEEDED) {
        await this.cancelPaymentIntent(booking.payment.paymentIntentId);
      }
      expired += 1;
    }
    return expired;
  }

  /** PAY-01: best effort; a failure is logged (the hold is already gone, so a late payment is refunded by payments). */
  private async cancelPaymentIntent(paymentIntentId: string): Promise<void> {
    try {
      await this.stripeService.stripe.paymentIntents.cancel(paymentIntentId);
    } catch (error) {
      this.logger.warn(`Could not cancel PaymentIntent ${paymentIntentId}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async toResponse(booking: HotelBookingRecord, hotel: HotelRecord, roomById: Map<string, RoomRecord>): Promise<HotelBookingResponseDto> {
    const typeIds = [...new Set([...roomById.values()].map((room) => room.roomTypeId.toString()))];
    const types = await this.roomTypeModel.find({ _id: { $in: typeIds } }).select('name').lean<{ _id: Types.ObjectId; name: string }[]>().exec();
    const typeName = new Map(types.map((type) => [type._id.toString(), type.name]));
    const { startDate, endDate } = bookingRange(booking);

    const rooms = booking.rooms.map((booked) => {
      const room = roomById.get(booked.roomId.toString());
      const adults = booked.guestAges.filter((age) => age >= ADULT_AGE).length;
      return {
        roomId: booked.roomId.toString(),
        number: room?.number ?? 0,
        type: room ? (typeName.get(room.roomTypeId.toString()) ?? null) : null,
        pricePerNight: booked.pricePerNight,
        adults,
        childAges: booked.guestAges.filter((age) => age < ADULT_AGE),
        price: booked.pricePerNight * booking.nightsCount,
      };
    });
    return {
      id: booking._id.toString(),
      status: booking.status,
      hotel: { id: hotel._id.toString(), name: hotel.name },
      checkIn: startDate.toISOString().slice(0, 10),
      checkOut: endDate.toISOString().slice(0, 10),
      nights: booking.nightsCount,
      rooms,
      adults: rooms.reduce((sum, room) => sum + room.adults, 0),
      children: rooms.reduce((sum, room) => sum + room.childAges.length, 0),
      total: booking.cost,
      holdExpiresAt: booking.holdExpiresAt ? booking.holdExpiresAt.toISOString() : null,
    };
  }
}
