import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { FilterQuery, isValidObjectId, Model, Types } from 'mongoose';
import { Hotel } from './schemas/hotel.schema.js';
import { Room } from './schemas/room.schema.js';
import { HotelBooking } from '../hotel-bookings/schemas/hotel-booking.schema.js';
import { HotelBookingStatus } from '../common/enums/hotel-booking-status.enum.js';
import { Role } from '../common/enums/role.enum.js';
import {
  nightsBetween,
  rangeContains,
  rangesOverlap,
  todayUtcMidnight,
  toUtcMidnight,
} from '../common/utils/date.util.js';
import type { JwtUser } from '../common/auth/jwt-user.interface.js';
import type { SearchHotelsDto } from './dto/search-hotels.dto.js';
import type { AvailableRoomsDto } from './dto/available-rooms.dto.js';
import type { ListReservationsDto } from './dto/list-reservations.dto.js';

interface Stay {
  checkIn: Date;
  checkOut: Date;
  nights: number;
}

/** A room as returned by `.lean()` — plain object with an `_id`. */
type RoomLike = Room & { _id?: Types.ObjectId };

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(HotelBooking.name)
    private readonly bookingModel: Model<HotelBooking>,
  ) {}

  /**
   * HTL-11 + HTL-12 — search active hotels by city/country for a stay, keeping
   * only hotels with at least `rooms` free rooms whose combined max occupancy
   * covers `guests`; then filter by price / rating and sort.
   */
  async search(dto: SearchHotelsDto) {
    const stay = this.parseStay(dto.checkIn, dto.checkOut);

    const hotelFilter: FilterQuery<Hotel> = { active: true };
    if (dto.city) hotelFilter.city = { $regex: `^${escapeRegex(dto.city)}$`, $options: 'i' };
    if (dto.country) hotelFilter.country = { $regex: `^${escapeRegex(dto.country)}$`, $options: 'i' };

    const hotels = await this.hotelModel.find(hotelFilter).lean();
    if (hotels.length === 0) return this.paginate([], dto.page, dto.limit);

    const hotelIds = hotels.map((h) => h._id as Types.ObjectId);
    const rooms = await this.roomModel
      .find({ hotelId: { $in: hotelIds }, active: true })
      .lean();
    const occupied = await this.getOccupiedRoomIds(hotelIds, stay);

    // Free rooms grouped per hotel.
    const freeByHotel = new Map<string, RoomLike[]>();
    for (const room of rooms) {
      if (this.isRoomFree(room, stay, occupied)) {
        const key = room.hotelId.toString();
        const list = freeByHotel.get(key) ?? [];
        list.push(room);
        freeByHotel.set(key, list);
      }
    }

    const results = [];
    for (const hotel of hotels) {
      const free = freeByHotel.get((hotel._id as Types.ObjectId).toString()) ?? [];
      if (free.length < dto.rooms) continue;

      // Combined max occupancy of the best `rooms` rooms must cover the guests.
      const topOccupancy = [...free]
        .sort((a, b) => b.maxOccupancy - a.maxOccupancy)
        .slice(0, dto.rooms)
        .reduce((s, r) => s + r.maxOccupancy, 0);
      if (topOccupancy < dto.guests) continue;

      const cheapest = Math.min(...free.map((r) => r.pricePerNight));

      // HTL-12 filters.
      if (dto.minPrice !== undefined && cheapest < dto.minPrice) continue;
      if (dto.maxPrice !== undefined && cheapest > dto.maxPrice) continue;
      if (dto.minRating !== undefined) {
        if (!hotel.ratingsCount || hotel.averageRating < dto.minRating) continue;
      }

      results.push({
        id: (hotel._id as Types.ObjectId).toString(),
        name: hotel.name,
        city: hotel.city,
        country: hotel.country,
        starClass: hotel.starClass ?? null,
        averageRating: hotel.averageRating ?? 0,
        ratingsCount: hotel.ratingsCount ?? 0,
        photos: hotel.photos ?? [],
        cheapestRoomPrice: cheapest,
        freeRoomsCount: free.length,
        nights: stay.nights,
      });
    }

    // HTL-12 sort.
    const dir = dto.sortOrder === 'desc' ? -1 : 1;
    if (dto.sortBy === 'price') {
      results.sort((a, b) => (a.cheapestRoomPrice - b.cheapestRoomPrice) * dir);
    } else if (dto.sortBy === 'rating') {
      results.sort((a, b) => (a.averageRating - b.averageRating) * dir);
    }

    return this.paginate(results, dto.page, dto.limit);
  }

  /**
   * HTL-15 — every room of a hotel that is free for the searched dates, with
   * per-night and total-stay price so the user can pick one or more to book.
   */
  async availableRooms(hotelId: string, dto: AvailableRoomsDto) {
    if (!isValidObjectId(hotelId)) throw new NotFoundException('Hotel not found');
    const hotel = await this.hotelModel.findById(hotelId).lean();
    if (!hotel) throw new NotFoundException('Hotel not found');

    const stay = this.parseStay(dto.checkIn, dto.checkOut);

    // Deactivated hotels cannot be booked (ACC-15) — no rooms are offered.
    if (!hotel.active) {
      return this.emptyRoomsResponse(hotel, stay);
    }

    const rooms = await this.roomModel
      .find({ hotelId: new Types.ObjectId(hotelId), active: true })
      .lean();
    const occupied = await this.getOccupiedRoomIds(
      [hotel._id as Types.ObjectId],
      stay,
    );

    const available = rooms
      .filter((room) => this.isRoomFree(room, stay, occupied))
      .filter((room) => (dto.guests ? room.maxOccupancy >= dto.guests : true))
      .map((room) => ({
        roomId: (room._id as Types.ObjectId).toString(),
        roomNumber: room.roomNumber,
        type: room.type,
        beds: room.beds,
        maxOccupancy: room.maxOccupancy,
        pricePerNight: room.pricePerNight,
        totalStayPrice: Math.round(room.pricePerNight * stay.nights * 100) / 100,
      }));

    return {
      hotel: {
        id: (hotel._id as Types.ObjectId).toString(),
        name: hotel.name,
        city: hotel.city,
        country: hotel.country,
        checkInTime: hotel.checkInTime,
        checkOutTime: hotel.checkOutTime,
      },
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      nights: stay.nights,
      rooms: available,
    };
  }

  /**
   * HTL-22 — a hotel moderator views the reservations for their own hotel
   * (admins may view any hotel's reservations). Guests are not exposed to
   * other users.
   */
  async reservationsForHotel(
    hotelId: string,
    user: JwtUser,
    dto: ListReservationsDto,
  ) {
    if (!isValidObjectId(hotelId)) throw new NotFoundException('Hotel not found');
    const hotel = await this.hotelModel.findById(hotelId).lean();
    if (!hotel) throw new NotFoundException('Hotel not found');

    const ownsHotel =
      hotel.moderatorId?.toString() === user.sub ||
      user.hotelId === hotelId;
    const allowed =
      user.role === Role.ADMIN ||
      (user.role === Role.HOTEL_MODERATOR && ownsHotel);
    if (!allowed) {
      throw new ForbiddenException(
        'You can only view reservations for your own hotel.',
      );
    }

    const filter: FilterQuery<HotelBooking> = {
      hotelId: new Types.ObjectId(hotelId),
    };
    if (dto.status) filter.status = dto.status;
    if (dto.from || dto.to) {
      filter.checkIn = {};
      if (dto.from) filter.checkIn.$gte = this.parseDate(dto.from, 'from');
      if (dto.to) filter.checkIn.$lte = this.parseDate(dto.to, 'to');
    }

    const [docs, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .sort({ checkIn: 1 })
        .skip((dto.page - 1) * dto.limit)
        .limit(dto.limit)
        .populate('userId', 'firstName lastName name email')
        .lean(),
      this.bookingModel.countDocuments(filter),
    ]);

    const items = docs.map((b) => ({
      id: (b._id as Types.ObjectId).toString(),
      reference: b.reference ?? null,
      guest: b.userId ?? null,
      rooms: b.rooms.map((r) => ({ roomNumber: r.roomNumber, type: r.type })),
      checkIn: b.checkIn,
      checkOut: b.checkOut,
      guests: {
        adults: b.rooms.reduce((s, r) => s + r.adults, 0),
        children: b.rooms.reduce((s, r) => s + r.childrenAges.length, 0),
      },
      totalPrice: b.totalPrice,
      status: b.status,
    }));

    return {
      page: dto.page,
      limit: dto.limit,
      total,
      totalPages: Math.ceil(total / dto.limit),
      items,
    };
  }

  // ---- availability core ---------------------------------------------------

  /** A room is free for the stay iff it is bookable then, not blocked, and not held/booked. */
  private isRoomFree(room: RoomLike, stay: Stay, occupied: Set<string>): boolean {
    const roomId = room._id?.toString();
    if (roomId && occupied.has(roomId)) return false;

    // Must fall entirely within one declared availability range (HTL-04).
    const bookable = room.availability.some((r) =>
      rangeContains(toUtcMidnight(r.start), toUtcMidnight(r.end), stay.checkIn, stay.checkOut),
    );
    if (!bookable) return false;

    // Must not overlap any blocked range (HTL-06).
    const blocked = room.blockedRanges.some((r) =>
      rangesOverlap(toUtcMidnight(r.start), toUtcMidnight(r.end), stay.checkIn, stay.checkOut),
    );
    return !blocked;
  }

  /**
   * Room ids occupied for the stay by a Confirmed/Completed reservation or an
   * unexpired Pending-Payment hold (HTL-18).
   */
  private async getOccupiedRoomIds(
    hotelIds: Types.ObjectId[],
    stay: Stay,
  ): Promise<Set<string>> {
    const now = new Date();
    const bookings = await this.bookingModel
      .find({
        hotelId: { $in: hotelIds },
        // date overlap: existing.checkIn < stay.checkOut && existing.checkOut > stay.checkIn
        checkIn: { $lt: stay.checkOut },
        checkOut: { $gt: stay.checkIn },
        $or: [
          {
            status: {
              $in: [HotelBookingStatus.CONFIRMED, HotelBookingStatus.COMPLETED],
            },
          },
          {
            status: HotelBookingStatus.PENDING_PAYMENT,
            holdExpiresAt: { $gt: now },
          },
        ],
      })
      .select('rooms.roomId')
      .lean();

    const occupied = new Set<string>();
    for (const b of bookings) {
      for (const r of b.rooms) {
        if (r.roomId) occupied.add(r.roomId.toString());
      }
    }
    return occupied;
  }

  // ---- helpers -------------------------------------------------------------

  private parseStay(checkInStr: string, checkOutStr: string): Stay {
    const checkIn = this.parseDate(checkInStr, 'checkIn');
    const checkOut = this.parseDate(checkOutStr, 'checkOut');

    if (checkOut <= checkIn) {
      throw new BadRequestException('checkOut must be after checkIn.');
    }
    if (checkIn < todayUtcMidnight()) {
      throw new BadRequestException('checkIn cannot be in the past.');
    }
    return { checkIn, checkOut, nights: nightsBetween(checkIn, checkOut) };
  }

  private parseDate(value: string, field: string): Date {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      throw new BadRequestException(`Invalid date for "${field}".`);
    }
    return toUtcMidnight(d);
  }

  private paginate<T>(items: T[], page: number, limit: number) {
    const total = items.length;
    const start = (page - 1) * limit;
    return {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      items: items.slice(start, start + limit),
    };
  }

  private emptyRoomsResponse(hotel: Hotel & { _id?: Types.ObjectId }, stay: Stay) {
    return {
      hotel: {
        id: hotel._id?.toString(),
        name: hotel.name,
        city: hotel.city,
        country: hotel.country,
        checkInTime: hotel.checkInTime,
        checkOutTime: hotel.checkOutTime,
      },
      checkIn: stay.checkIn,
      checkOut: stay.checkOut,
      nights: stay.nights,
      rooms: [],
    };
  }
}

/** Escape user input used inside a RegExp (city/country exact, case-insensitive match). */
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
