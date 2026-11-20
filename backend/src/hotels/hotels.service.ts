import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import {
  BookingStatus,
  HotelBooking,
} from '../database/schemas/expense.schema.js';
import {
  Hotel,
  ProviderStatus,
  Room,
  RoomStatus,
  RoomType,
} from '../database/schemas/provider.schema.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { DateRangeDto } from './dto/date-range.dto.js';
import { HotelDetailsQueryDto } from './dto/hotel-details-query.dto.js';
import { UpdateAvailabilityDto } from './dto/update-availability.dto.js';
import { UpdateHotelPoliciesDto } from './dto/update-hotel-policies.dto.js';
import { UpdateRoomDto } from './dto/update-room.dto.js';

type DateRange = { startDate: Date; endDate: Date };
type RoomRecord = Room & { _id: Types.ObjectId };
type HotelBookingRecord = HotelBooking & { _id: Types.ObjectId };

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(RoomType.name) private readonly roomTypeModel: Model<RoomType>,
    @InjectModel(HotelBooking.name)
    private readonly hotelBookingModel: Model<HotelBooking>,
  ) {}

  /** HTL-02 — public profile, with available rooms when a stay is supplied. */
  async getHotelDetails(hotelId: string, query: HotelDetailsQueryDto) {
    const hotel = await this.findHotelOrThrow(hotelId);
    if (hotel.status !== ProviderStatus.ACTIVE) {
      throw new NotFoundException('Hotel not found.');
    }

    const details = this.hotelDetails(hotel);
    const hasCheckIn = query.checkIn !== undefined;
    const hasCheckOut = query.checkOut !== undefined;
    if (hasCheckIn !== hasCheckOut) {
      throw new BadRequestException(
        'checkIn and checkOut must be supplied together.',
      );
    }
    if (!hasCheckIn || !hasCheckOut) return details;

    const stay = this.parseRange({
      startDate: query.checkIn!,
      endDate: query.checkOut!,
    });
    const rooms = await this.roomModel
      .find({
        hotelId: hotel._id,
        status: RoomStatus.ACTIVE,
      })
      .exec();
    const bookings = await this.protectedBookingsForRooms(
      rooms.map((room) => room._id),
    );
    const roomTypes = await this.roomTypesForHotel(hotel._id);

    return {
      ...details,
      checkIn: stay.startDate,
      checkOut: stay.endDate,
      availableRooms: rooms
        .filter((room) => this.isBookable(room, stay, bookings))
        .map((room) =>
          this.roomResponse(
            room,
            roomTypes.get(room.roomTypeId.toString()) ?? null,
          ),
        ),
    };
  }

  /** HTL-03 — add an individually bookable room to the moderator's hotel. */
  async createRoom(
    hotelId: string,
    user: AuthenticatedUser,
    dto: CreateRoomDto,
  ) {
    const hotel = await this.findOwnedHotelOrThrow(hotelId, user);
    const typeName = dto.type.trim();
    if (!typeName) throw new BadRequestException('type cannot be empty.');

    const roomType = await this.roomTypeModel
      .findOneAndUpdate(
        { hotelId: hotel._id, name: typeName },
        { $setOnInsert: { hotelId: hotel._id, name: typeName } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      )
      .exec();

    try {
      const room = await this.roomModel.create({
        hotelId: hotel._id,
        number: dto.number,
        roomTypeId: roomType._id,
        bedCount: dto.bedCount,
        maxOccupancy: dto.maxOccupancy,
        pricePerNight: dto.pricePerNight,
        availability: [],
        blockedDates: [],
        status: RoomStatus.ACTIVE,
      });
      return this.roomResponse(room, roomType.name);
    } catch (error) {
      if (isDuplicateKeyError(error)) {
        throw new ConflictException(
          'A room with this number already exists in this hotel.',
        );
      }
      throw error;
    }
  }

  /** HTL-04 — add a non-overlapping bookable period for a room. */
  async addAvailability(
    hotelId: string,
    roomId: string,
    user: AuthenticatedUser,
    dto: DateRangeDto,
  ) {
    await this.findOwnedHotelOrThrow(hotelId, user);
    const room = await this.findRoomOrThrow(hotelId, roomId);
    const range = this.parseRange(dto);
    const availability = this.normaliseRanges([
      ...(room.availability ?? []),
      range,
    ]);
    room.availability = availability;
    await room.save();
    return this.roomResponse(room, await this.roomTypeName(room.roomTypeId));
  }

  /** HTL-05 — edit permitted room fields and replace its bookable periods. */
  async updateRoom(
    hotelId: string,
    roomId: string,
    user: AuthenticatedUser,
    dto: UpdateRoomDto,
  ) {
    await this.findOwnedHotelOrThrow(hotelId, user);
    const room = await this.findRoomOrThrow(hotelId, roomId);
    if (Object.keys(dto).length === 0) {
      throw new BadRequestException(
        'Provide at least one room field to update.',
      );
    }

    if (dto.availability !== undefined) {
      const availability = this.normaliseRanges(dto.availability);
      await this.assertProtectedReservationsRemainBookable(
        room._id,
        availability,
      );
      room.availability = availability;
    }

    if (dto.status === RoomStatus.DEACTIVATED) {
      await this.assertNoProtectedReservations(room._id, 'deactivate');
    }

    if (dto.bedCount !== undefined) room.bedCount = dto.bedCount;
    if (dto.maxOccupancy !== undefined) room.maxOccupancy = dto.maxOccupancy;
    if (dto.pricePerNight !== undefined) room.pricePerNight = dto.pricePerNight;
    if (dto.status !== undefined) room.status = dto.status;
    await room.save();
    return this.roomResponse(room, await this.roomTypeName(room.roomTypeId));
  }

  /** HTL-05/HTL-06 — block or unblock an exact date range for a room. */
  async updateAvailability(
    hotelId: string,
    roomId: string,
    user: AuthenticatedUser,
    dto: UpdateAvailabilityDto,
  ) {
    await this.findOwnedHotelOrThrow(hotelId, user);
    const room = await this.findRoomOrThrow(hotelId, roomId);
    const range = this.parseRange(dto);

    if (dto.action === 'block') {
      await this.assertNoProtectedReservationsOverlapping(
        room._id,
        range,
        'block',
      );
      room.blockedDates = this.normaliseRanges([
        ...(room.blockedDates ?? []),
        range,
      ]);
    } else {
      room.blockedDates = this.subtractRange(room.blockedDates ?? [], range);
    }

    await room.save();
    return this.roomResponse(room, await this.roomTypeName(room.roomTypeId));
  }

  /** HTL-06 — delete only rooms that have never appeared in a reservation. */
  async deleteRoom(hotelId: string, roomId: string, user: AuthenticatedUser) {
    await this.findOwnedHotelOrThrow(hotelId, user);
    const room = await this.findRoomOrThrow(hotelId, roomId);
    const reservationCount = await this.hotelBookingModel
      .countDocuments({
        'rooms.roomId': room._id,
      })
      .exec();
    if (reservationCount > 0) {
      throw new ConflictException(
        'A room that has been reserved cannot be deleted. Deactivate it instead.',
      );
    }

    await room.deleteOne();
    return { message: 'Room deleted.' };
  }

  /** HTL-08 — moderator calendar view for every room in their hotel. */
  async getAvailability(
    hotelId: string,
    user: AuthenticatedUser,
    query: AvailabilityQueryDto,
  ) {
    const hotel = await this.findOwnedHotelOrThrow(hotelId, user);
    const period = this.parseRange(query);
    const rooms = await this.roomModel.find({ hotelId: hotel._id }).exec();
    const bookings = await this.protectedBookingsForRooms(
      rooms.map((room) => room._id),
    );
    const roomTypes = await this.roomTypesForHotel(hotel._id);

    return {
      hotelId: hotel._id.toString(),
      startDate: period.startDate,
      endDate: period.endDate,
      rooms: rooms.map((room) => {
        const booking = this.bookingOverlappingRoom(room._id, period, bookings);
        const bookable = this.isBookable(room, period, bookings);
        const status = booking ? 'booked' : bookable ? 'available' : 'blocked';
        return {
          ...this.roomResponse(
            room,
            roomTypes.get(room.roomTypeId.toString()) ?? null,
          ),
          availabilityStatus: status,
          reservationReference: booking?._id.toString() ?? null,
          deactivated: room.status === RoomStatus.DEACTIVATED,
        };
      }),
    };
  }

  /** HTL-09/HTL-10 — set displayed check-in/out times and cancellation tiers. */
  async updatePolicies(
    hotelId: string,
    user: AuthenticatedUser,
    dto: UpdateHotelPoliciesDto,
  ) {
    const hotel = await this.findOwnedHotelOrThrow(hotelId, user);
    const checkInTime = this.timeToMinutes(dto.checkInTime, 'checkInTime');
    const checkOutTime = this.timeToMinutes(dto.checkOutTime, 'checkOutTime');

    const tiers = [...dto.cancellationTiers].sort(
      (left, right) => left.daysBeforeCheckIn - right.daysBeforeCheckIn,
    );
    hotel.checkingPolicy = { checkInTime, checkOutTime };
    hotel.cancellationPolicies = tiers.map((tier, index) => ({
      daysBeforeService: {
        startDay: tier.daysBeforeCheckIn,
        endDay: tiers[index + 1]?.daysBeforeCheckIn ?? null,
      },
      refundPercentage: tier.refundPercentage,
    }));
    await hotel.save();
    return this.hotelPolicyResponse(hotel);
  }

  private async findHotelOrThrow(hotelId: string) {
    if (!isValidObjectId(hotelId))
      throw new NotFoundException('Hotel not found.');
    const hotel = await this.hotelModel.findById(hotelId).exec();
    if (!hotel) throw new NotFoundException('Hotel not found.');
    return hotel;
  }

  private async findOwnedHotelOrThrow(
    hotelId: string,
    user: AuthenticatedUser,
  ) {
    const hotel = await this.findHotelOrThrow(hotelId);
    if (hotel.moderatorId.toString() !== user.id) {
      throw new ForbiddenException(
        'You can only manage rooms for your own hotel.',
      );
    }
    return hotel;
  }

  private async findRoomOrThrow(hotelId: string, roomId: string) {
    if (!isValidObjectId(roomId))
      throw new NotFoundException('Room not found.');
    const room = await this.roomModel.findOne({ _id: roomId, hotelId }).exec();
    if (!room) throw new NotFoundException('Room not found.');
    return room;
  }

  private async roomTypeName(
    roomTypeId: Types.ObjectId,
  ): Promise<string | null> {
    const roomType = await this.roomTypeModel.findById(roomTypeId).exec();
    return roomType?.name ?? null;
  }

  private async roomTypesForHotel(
    hotelId: Types.ObjectId,
  ): Promise<Map<string, string>> {
    const types = await this.roomTypeModel.find({ hotelId }).exec();
    return new Map(
      types.map((roomType) => [roomType._id.toString(), roomType.name]),
    );
  }

  private hotelDetails(hotel: Hotel & { _id: Types.ObjectId }) {
    return {
      id: hotel._id.toString(),
      name: hotel.name,
      description: hotel.description ?? null,
      address: hotel.address,
      cityId: hotel.cityId.toString(),
      imageUrls: hotel.imageUrls ?? [],
      starClass: hotel.starClass,
      amenities: hotel.amenities ?? [],
      checkInTime: this.minutesToTime(hotel.checkingPolicy.checkInTime),
      checkOutTime: this.minutesToTime(hotel.checkingPolicy.checkOutTime),
      cancellationTiers: this.cancellationTiers(hotel),
      averageRating: hotel.averageRating,
    };
  }

  private hotelPolicyResponse(hotel: Hotel & { _id: Types.ObjectId }) {
    return {
      hotelId: hotel._id.toString(),
      checkInTime: this.minutesToTime(hotel.checkingPolicy.checkInTime),
      checkOutTime: this.minutesToTime(hotel.checkingPolicy.checkOutTime),
      cancellationTiers: this.cancellationTiers(hotel),
    };
  }

  private cancellationTiers(hotel: Hotel) {
    return [...(hotel.cancellationPolicies ?? [])]
      .sort(
        (left, right) =>
          left.daysBeforeService.startDay - right.daysBeforeService.startDay,
      )
      .map((tier) => ({
        daysBeforeCheckIn: tier.daysBeforeService.startDay,
        refundPercentage: tier.refundPercentage,
      }));
  }

  private roomResponse(
    room: Room & { _id: Types.ObjectId },
    type: string | null,
  ) {
    return {
      id: room._id.toString(),
      number: room.number,
      type,
      bedCount: room.bedCount,
      maxOccupancy: room.maxOccupancy,
      pricePerNight: room.pricePerNight,
      status: room.status,
      availability: this.serialiseRanges(room.availability ?? []),
      blockedDates: this.serialiseRanges(room.blockedDates ?? []),
    };
  }

  private serialiseRanges(ranges: DateRange[]) {
    return ranges.map((range) => ({
      startDate: this.toDateOnly(range.startDate),
      endDate: this.toDateOnly(range.endDate),
    }));
  }

  private parseRange(input: DateRangeDto): DateRange {
    const startDate = this.parseDate(input.startDate, 'startDate');
    const endDate = this.parseDate(input.endDate, 'endDate');
    if (endDate <= startDate) {
      throw new BadRequestException('endDate must be after startDate.');
    }
    return { startDate, endDate };
  }

  private normaliseRanges(
    ranges: Array<DateRange | DateRangeDto>,
  ): DateRange[] {
    const normalised = ranges
      .map((range) =>
        this.parseRange({
          startDate: this.toDateOnly(range.startDate),
          endDate: this.toDateOnly(range.endDate),
        }),
      )
      .sort(
        (left, right) => left.startDate.getTime() - right.startDate.getTime(),
      );

    for (let index = 1; index < normalised.length; index += 1) {
      if (this.rangesOverlap(normalised[index - 1], normalised[index])) {
        throw new ConflictException('Date ranges must not overlap.');
      }
    }
    return normalised;
  }

  private parseDate(value: string, field: string): Date {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
      throw new BadRequestException(`${field} must use YYYY-MM-DD format.`);
    }
    const date = new Date(`${value}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || this.toDateOnly(date) !== value) {
      throw new BadRequestException(`${field} must be a real calendar date.`);
    }
    return date;
  }

  private toDateOnly(value: Date | string): string {
    return new Date(value).toISOString().slice(0, 10);
  }

  private rangesOverlap(left: DateRange, right: DateRange): boolean {
    return left.startDate < right.endDate && left.endDate > right.startDate;
  }

  private rangeContains(outer: DateRange, inner: DateRange): boolean {
    return outer.startDate <= inner.startDate && outer.endDate >= inner.endDate;
  }

  private subtractRange(ranges: DateRange[], remove: DateRange): DateRange[] {
    const result: DateRange[] = [];
    for (const range of ranges) {
      if (!this.rangesOverlap(range, remove)) {
        result.push(range);
        continue;
      }
      if (range.startDate < remove.startDate) {
        result.push({ startDate: range.startDate, endDate: remove.startDate });
      }
      if (range.endDate > remove.endDate) {
        result.push({ startDate: remove.endDate, endDate: range.endDate });
      }
    }
    return result;
  }

  private isBookable(
    room: RoomRecord,
    period: DateRange,
    bookings: HotelBookingRecord[],
  ): boolean {
    if (room.status !== RoomStatus.ACTIVE) return false;
    const inAvailability = (room.availability ?? []).some((range) =>
      this.rangeContains(range, period),
    );
    if (!inAvailability) return false;
    if (
      (room.blockedDates ?? []).some((range) =>
        this.rangesOverlap(range, period),
      )
    )
      return false;
    return (
      this.bookingOverlappingRoom(room._id, period, bookings) === undefined
    );
  }

  private async protectedBookingsForRooms(
    roomIds: Types.ObjectId[],
  ): Promise<HotelBookingRecord[]> {
    if (roomIds.length === 0) return [];
    return this.hotelBookingModel
      .find({
        'rooms.roomId': { $in: roomIds },
        status: {
          $in: [BookingStatus.CONFIRMED, BookingStatus.PENDING_PAYMENT],
        },
      })
      .exec() as Promise<HotelBookingRecord[]>;
  }

  private bookingOverlappingRoom(
    roomId: Types.ObjectId,
    period: DateRange,
    bookings: HotelBookingRecord[],
  ): HotelBookingRecord | undefined {
    return bookings.find((booking) => {
      const includesRoom = booking.rooms.some(
        (room) => room.roomId.toString() === roomId.toString(),
      );
      return (
        includesRoom && this.rangesOverlap(this.bookingRange(booking), period)
      );
    });
  }

  private bookingRange(booking: HotelBooking): DateRange {
    const startDate = new Date(booking.startDate);
    startDate.setUTCHours(0, 0, 0, 0);
    const endDate = new Date(startDate);
    endDate.setUTCDate(endDate.getUTCDate() + booking.nightsCount);
    return { startDate, endDate };
  }

  private async assertNoProtectedReservations(
    roomId: Types.ObjectId,
    action: string,
  ) {
    const bookings = await this.protectedBookingsForRooms([roomId]);
    if (bookings.length > 0) {
      throw new ConflictException(
        `Cannot ${action} a room with a Confirmed or Pending Payment reservation.`,
      );
    }
  }

  private async assertNoProtectedReservationsOverlapping(
    roomId: Types.ObjectId,
    range: DateRange,
    action: string,
  ) {
    const bookings = await this.protectedBookingsForRooms([roomId]);
    if (this.bookingOverlappingRoom(roomId, range, bookings)) {
      throw new ConflictException(
        `Cannot ${action} dates with a Confirmed or Pending Payment reservation.`,
      );
    }
  }

  private async assertProtectedReservationsRemainBookable(
    roomId: Types.ObjectId,
    availability: DateRange[],
  ) {
    const bookings = await this.protectedBookingsForRooms([roomId]);
    const missingBooking = bookings.find((booking) => {
      const bookingRange = this.bookingRange(booking);
      return !availability.some((range) =>
        this.rangeContains(range, bookingRange),
      );
    });
    if (missingBooking) {
      throw new ConflictException(
        'Availability cannot be removed for a Confirmed or Pending Payment reservation.',
      );
    }
  }

  private timeToMinutes(value: string, field: string): number {
    const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
    if (!match)
      throw new BadRequestException(
        `${field} must use HH:mm (24-hour) format.`,
      );
    return Number(match[1]) * 60 + Number(match[2]);
  }

  private minutesToTime(value: number): string {
    const hours = Math.floor(value / 60)
      .toString()
      .padStart(2, '0');
    const minutes = (value % 60).toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11000
  );
}
