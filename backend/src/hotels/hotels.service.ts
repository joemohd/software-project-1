import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectConnection, InjectModel } from '@nestjs/mongoose';
import { Connection, isValidObjectId, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { rethrowProviderError } from '../common/providers/profile.rules.js';
import { City } from '../database/schemas/city.schema.js';
import { Country } from '../database/schemas/country.schema.js';
import { BookingStatus, HotelBooking } from '../database/schemas/expense.schema.js';
import { Hotel, ProviderStatus, Room, RoomStatus, RoomType } from '../database/schemas/provider.schema.js';
import { User, UserRole } from '../database/schemas/user.schema.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { DateRangeDto } from './dto/date-range.dto.js';
import { HotelDetailsQueryDto } from './dto/hotel-details-query.dto.js';
import { HotelProfileDto } from './dto/hotel-profile.dto.js';
import { UpdateAvailabilityDto } from './dto/update-availability.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';
import { UpdateHotelPoliciesDto } from './dto/update-hotel-policies.dto.js';
import { UpdateRoomDto } from './dto/update-room.dto.js';

type DateRange = { startDate: Date; endDate: Date };
type RoomRecord = Room & { _id: Types.ObjectId };
type HotelRecord = Hotel & { _id: Types.ObjectId };
type HotelBookingRecord = HotelBooking & { _id: Types.ObjectId };

@Injectable()
export class HotelsService {
  constructor(
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(RoomType.name) private readonly roomTypeModel: Model<RoomType>,
    @InjectModel(HotelBooking.name) private readonly hotelBookingModel: Model<HotelBooking>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
    @InjectConnection() private readonly connection: Connection,
  ) {}

  async create(admin: AuthenticatedUser, dto: CreateHotelDto): Promise<HotelProfileDto> {
    if (admin.role !== UserRole.ADMIN) throw new ForbiddenException('Administrator access is required.');
    try {
      return await this.connection.transaction(async (session) => {
        const moderatorId = new Types.ObjectId(dto.moderatorId);
        const moderator = await this.userModel.exists({ _id: moderatorId, role: UserRole.HOTEL_MODERATOR }).session(session).exec();
        if (!moderator) throw new BadRequestException('moderatorId must refer to a hotel moderator.');
        const countryId = await this.countryForCity(dto.cityId, dto.countryId, session);
        const [hotel] = await this.hotelModel.create([{
          name: dto.name, address: dto.address, cityId: new Types.ObjectId(dto.cityId), moderatorId,
          description: dto.description, imageUrls: dto.imageUrls ?? [], starClass: dto.starClass, amenities: dto.amenities ?? [],
        }], { session });
        return this.toProfile(hotel, countryId);
      });
    } catch (error) { rethrowProviderError(error); }
  }

  async update(user: AuthenticatedUser, id: string, dto: UpdateHotelDto): Promise<HotelProfileDto> {
    if (user.role !== UserRole.HOTEL_MODERATOR) throw new ForbiddenException('Hotel moderator access is required.');
    if (Object.keys(dto).length === 0) throw new BadRequestException('Provide at least one profile field to update.');
    if (dto.countryId !== undefined && dto.cityId === undefined) throw new BadRequestException('Provide cityId when changing countryId.');
    const ownerFilter = { _id: id, moderatorId: new Types.ObjectId(user.id) };
    const existing = await this.hotelModel.findOne(ownerFilter).lean<HotelRecord>().exec();
    if (!existing) throw new NotFoundException('Hotel not found or not assigned to you.');
    const countryId = await this.countryForCity(dto.cityId ?? existing.cityId.toString(), dto.countryId);
    const fields: Partial<Hotel> = {};
    if (dto.name !== undefined) fields.name = dto.name;
    if (dto.address !== undefined) fields.address = dto.address;
    if (dto.cityId !== undefined) fields.cityId = new Types.ObjectId(dto.cityId);
    if (dto.description !== undefined) fields.description = dto.description;
    if (dto.imageUrls !== undefined) fields.imageUrls = dto.imageUrls;
    if (dto.starClass !== undefined) fields.starClass = dto.starClass;
    if (dto.amenities !== undefined) fields.amenities = dto.amenities;
    const hotel = await this.hotelModel.findOneAndUpdate(ownerFilter, { $set: fields }, { returnDocument: 'after', runValidators: true }).lean<HotelRecord>().exec();
    if (!hotel) throw new NotFoundException('Hotel not found or not assigned to you.');
    return this.toProfile(hotel, countryId);
  }

  async getHotelDetails(hotelId: string, query: HotelDetailsQueryDto) {
    const hotel = await this.findHotelOrThrow(hotelId);
    if (hotel.status !== ProviderStatus.ACTIVE) throw new NotFoundException('Hotel not found.');
    const details = this.hotelDetails(hotel);
    const hasCheckIn = query.checkIn !== undefined;
    const hasCheckOut = query.checkOut !== undefined;
    if (hasCheckIn !== hasCheckOut) throw new BadRequestException('checkIn and checkOut must be supplied together.');
    if (!hasCheckIn || !hasCheckOut) return details;
    const stay = this.parseRange({ startDate: query.checkIn!, endDate: query.checkOut! });
    const rooms = await this.roomModel.find({ hotelId: hotel._id, status: RoomStatus.ACTIVE }).exec();
    const bookings = await this.protectedBookingsForRooms(rooms.map((room) => room._id));
    const roomTypes = await this.roomTypesForHotel(hotel._id);
    return { ...details, checkIn: stay.startDate, checkOut: stay.endDate,
      availableRooms: rooms.filter((room) => this.isBookable(room, stay, bookings)).map((room) => this.roomResponse(room, roomTypes.get(room.roomTypeId.toString()) ?? null)) };
  }

  async createRoom(hotelId: string, user: AuthenticatedUser, dto: CreateRoomDto) {
    const hotel = await this.findOwnedHotelOrThrow(hotelId, user);
    const typeName = dto.type.trim();
    if (!typeName) throw new BadRequestException('type cannot be empty.');
    const roomType = await this.roomTypeModel.findOneAndUpdate({ hotelId: hotel._id, name: typeName },
      { $setOnInsert: { hotelId: hotel._id, name: typeName } }, { new: true, upsert: true, setDefaultsOnInsert: true }).exec();
    try {
      const room = await this.roomModel.create({ hotelId: hotel._id, number: dto.number, roomTypeId: roomType._id, bedCount: dto.bedCount,
        maxOccupancy: dto.maxOccupancy, pricePerNight: dto.pricePerNight, availability: [], blockedDates: [], status: RoomStatus.ACTIVE });
      return this.roomResponse(room, roomType.name);
    } catch (error) { if (isDuplicateKeyError(error)) throw new ConflictException('A room with this number already exists in this hotel.'); throw error; }
  }

  async addAvailability(hotelId: string, roomId: string, user: AuthenticatedUser, dto: DateRangeDto) {
    await this.findOwnedHotelOrThrow(hotelId, user); const room = await this.findRoomOrThrow(hotelId, roomId);
    room.availability = this.normaliseRanges([...(room.availability ?? []), this.parseRange(dto)]); await room.save();
    return this.roomResponse(room, await this.roomTypeName(room.roomTypeId));
  }

  async updateRoom(hotelId: string, roomId: string, user: AuthenticatedUser, dto: UpdateRoomDto) {
    await this.findOwnedHotelOrThrow(hotelId, user); const room = await this.findRoomOrThrow(hotelId, roomId);
    if (!Object.keys(dto).length) throw new BadRequestException('Provide at least one room field to update.');
    if (dto.availability !== undefined) { const availability = this.normaliseRanges(dto.availability); await this.assertProtectedReservationsRemainBookable(room._id, availability); room.availability = availability; }
    if (dto.status === RoomStatus.DEACTIVATED) await this.assertNoProtectedReservations(room._id, 'deactivate');
    if (dto.bedCount !== undefined) room.bedCount = dto.bedCount;
    if (dto.maxOccupancy !== undefined) room.maxOccupancy = dto.maxOccupancy;
    if (dto.pricePerNight !== undefined) room.pricePerNight = dto.pricePerNight;
    if (dto.status !== undefined) room.status = dto.status;
    await room.save(); return this.roomResponse(room, await this.roomTypeName(room.roomTypeId));
  }

  async updateAvailability(hotelId: string, roomId: string, user: AuthenticatedUser, dto: UpdateAvailabilityDto) {
    await this.findOwnedHotelOrThrow(hotelId, user); const room = await this.findRoomOrThrow(hotelId, roomId); const range = this.parseRange(dto);
    if (dto.action === 'block') { await this.assertNoProtectedReservationsOverlapping(room._id, range, 'block'); room.blockedDates = this.normaliseRanges([...(room.blockedDates ?? []), range]); }
    else room.blockedDates = this.subtractRange(room.blockedDates ?? [], range);
    await room.save(); return this.roomResponse(room, await this.roomTypeName(room.roomTypeId));
  }

  async deleteRoom(hotelId: string, roomId: string, user: AuthenticatedUser) {
    await this.findOwnedHotelOrThrow(hotelId, user); const room = await this.findRoomOrThrow(hotelId, roomId);
    if (await this.hotelBookingModel.countDocuments({ 'rooms.roomId': room._id }).exec() > 0) throw new ConflictException('A room that has been reserved cannot be deleted. Deactivate it instead.');
    await room.deleteOne(); return { message: 'Room deleted.' };
  }

  async getAvailability(hotelId: string, user: AuthenticatedUser, query: AvailabilityQueryDto) {
    const hotel = await this.findOwnedHotelOrThrow(hotelId, user); const period = this.parseRange(query);
    const rooms = await this.roomModel.find({ hotelId: hotel._id }).exec(); const bookings = await this.protectedBookingsForRooms(rooms.map((room) => room._id));
    const roomTypes = await this.roomTypesForHotel(hotel._id);
    return { hotelId: hotel._id.toString(), startDate: period.startDate, endDate: period.endDate, rooms: rooms.map((room) => {
      const booking = this.bookingOverlappingRoom(room._id, period, bookings); const bookable = this.isBookable(room, period, bookings);
      return { ...this.roomResponse(room, roomTypes.get(room.roomTypeId.toString()) ?? null), availabilityStatus: booking ? 'booked' : bookable ? 'available' : 'blocked', reservationReference: booking?._id.toString() ?? null, deactivated: room.status === RoomStatus.DEACTIVATED };
    }) };
  }

  async updatePolicies(hotelId: string, user: AuthenticatedUser, dto: UpdateHotelPoliciesDto) {
    const hotel = await this.findOwnedHotelOrThrow(hotelId, user); const checkInTime = this.timeToMinutes(dto.checkInTime, 'checkInTime'); const checkOutTime = this.timeToMinutes(dto.checkOutTime, 'checkOutTime');
    const tiers = [...dto.cancellationTiers].sort((a, b) => a.daysBeforeCheckIn - b.daysBeforeCheckIn);
    hotel.checkingPolicy = { checkInTime, checkOutTime }; hotel.cancellationPolicies = tiers.map((tier, index) => ({ daysBeforeService: { startDay: tier.daysBeforeCheckIn, endDay: tiers[index + 1]?.daysBeforeCheckIn ?? null }, refundPercentage: tier.refundPercentage }));
    await hotel.save(); return this.hotelPolicyResponse(hotel);
  }

  private async countryForCity(cityId: string, expectedCountryId?: string, session: import('mongoose').ClientSession | null = null): Promise<string> {
    const city = await this.cityModel.findById(cityId).session(session).lean<{ countryId: Types.ObjectId }>().exec();
    if (!city) throw new BadRequestException('cityId does not match a known city.'); const countryId = city.countryId.toString();
    if (expectedCountryId !== undefined && !city.countryId.equals(expectedCountryId)) throw new BadRequestException('The city does not belong to the selected country.');
    if (!await this.countryModel.exists({ _id: city.countryId }).session(session).exec()) throw new BadRequestException('countryId does not match a known country.'); return countryId;
  }
  private toProfile(hotel: HotelRecord, countryId: string): HotelProfileDto { return { id: hotel._id.toString(), name: hotel.name, address: hotel.address, cityId: hotel.cityId.toString(), countryId, description: hotel.description ?? '', imageUrls: hotel.imageUrls, starClass: hotel.starClass, amenities: hotel.amenities }; }
  private async findHotelOrThrow(id: string) { if (!isValidObjectId(id)) throw new NotFoundException('Hotel not found.'); const hotel = await this.hotelModel.findById(id).exec(); if (!hotel) throw new NotFoundException('Hotel not found.'); return hotel; }
  private async findOwnedHotelOrThrow(id: string, user: AuthenticatedUser) { const hotel = await this.findHotelOrThrow(id); if (hotel.moderatorId.toString() !== user.id) throw new ForbiddenException('You can only manage rooms for your own hotel.'); return hotel; }
  private async findRoomOrThrow(hotelId: string, roomId: string) { if (!isValidObjectId(roomId)) throw new NotFoundException('Room not found.'); const room = await this.roomModel.findOne({ _id: roomId, hotelId }).exec(); if (!room) throw new NotFoundException('Room not found.'); return room; }
  private async roomTypeName(id: Types.ObjectId): Promise<string | null> { return (await this.roomTypeModel.findById(id).exec())?.name ?? null; }
  private async roomTypesForHotel(id: Types.ObjectId): Promise<Map<string, string>> { const types = await this.roomTypeModel.find({ hotelId: id }).exec(); return new Map(types.map((type) => [type._id.toString(), type.name])); }
  private hotelDetails(hotel: Hotel & { _id: Types.ObjectId }) { return { id: hotel._id.toString(), name: hotel.name, description: hotel.description ?? null, address: hotel.address, cityId: hotel.cityId.toString(), imageUrls: hotel.imageUrls ?? [], starClass: hotel.starClass, amenities: hotel.amenities ?? [], checkInTime: this.minutesToTime(hotel.checkingPolicy.checkInTime), checkOutTime: this.minutesToTime(hotel.checkingPolicy.checkOutTime), cancellationTiers: this.cancellationTiers(hotel), averageRating: hotel.averageRating }; }
  private hotelPolicyResponse(hotel: Hotel & { _id: Types.ObjectId }) { return { hotelId: hotel._id.toString(), checkInTime: this.minutesToTime(hotel.checkingPolicy.checkInTime), checkOutTime: this.minutesToTime(hotel.checkingPolicy.checkOutTime), cancellationTiers: this.cancellationTiers(hotel) }; }
  private cancellationTiers(hotel: Hotel) { return [...(hotel.cancellationPolicies ?? [])].sort((a, b) => a.daysBeforeService.startDay - b.daysBeforeService.startDay).map((tier) => ({ daysBeforeCheckIn: tier.daysBeforeService.startDay, refundPercentage: tier.refundPercentage })); }
  private roomResponse(room: Room & { _id: Types.ObjectId }, type: string | null) { return { id: room._id.toString(), number: room.number, type, bedCount: room.bedCount, maxOccupancy: room.maxOccupancy, pricePerNight: room.pricePerNight, status: room.status, availability: this.serialiseRanges(room.availability ?? []), blockedDates: this.serialiseRanges(room.blockedDates ?? []) }; }
  private serialiseRanges(ranges: DateRange[]) { return ranges.map((range) => ({ startDate: this.toDateOnly(range.startDate), endDate: this.toDateOnly(range.endDate) })); }
  private parseRange(input: DateRangeDto): DateRange { const startDate = this.parseDate(input.startDate, 'startDate'); const endDate = this.parseDate(input.endDate, 'endDate'); if (endDate <= startDate) throw new BadRequestException('endDate must be after startDate.'); return { startDate, endDate }; }
  private normaliseRanges(ranges: Array<DateRange | DateRangeDto>): DateRange[] { const values = ranges.map((range) => this.parseRange({ startDate: this.toDateOnly(range.startDate), endDate: this.toDateOnly(range.endDate) })).sort((a, b) => a.startDate.getTime() - b.startDate.getTime()); for (let i = 1; i < values.length; i++) if (this.rangesOverlap(values[i - 1], values[i])) throw new ConflictException('Date ranges must not overlap.'); return values; }
  private parseDate(value: string, field: string): Date { if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new BadRequestException(`${field} must use YYYY-MM-DD format.`); const date = new Date(`${value}T00:00:00.000Z`); if (Number.isNaN(date.getTime()) || this.toDateOnly(date) !== value) throw new BadRequestException(`${field} must be a real calendar date.`); return date; }
  private toDateOnly(value: Date | string): string { return new Date(value).toISOString().slice(0, 10); }
  private rangesOverlap(a: DateRange, b: DateRange) { return a.startDate < b.endDate && a.endDate > b.startDate; }
  private rangeContains(a: DateRange, b: DateRange) { return a.startDate <= b.startDate && a.endDate >= b.endDate; }
  private subtractRange(ranges: DateRange[], remove: DateRange): DateRange[] { const result: DateRange[] = []; for (const range of ranges) { if (!this.rangesOverlap(range, remove)) { result.push(range); continue; } if (range.startDate < remove.startDate) result.push({ startDate: range.startDate, endDate: remove.startDate }); if (range.endDate > remove.endDate) result.push({ startDate: remove.endDate, endDate: range.endDate }); } return result; }
  private isBookable(room: RoomRecord, period: DateRange, bookings: HotelBookingRecord[]) { if (room.status !== RoomStatus.ACTIVE) return false; if (!(room.availability ?? []).some((range) => this.rangeContains(range, period))) return false; if ((room.blockedDates ?? []).some((range) => this.rangesOverlap(range, period))) return false; return !this.bookingOverlappingRoom(room._id, period, bookings); }
  private async protectedBookingsForRooms(ids: Types.ObjectId[]): Promise<HotelBookingRecord[]> { if (!ids.length) return []; return this.hotelBookingModel.find({ 'rooms.roomId': { $in: ids }, status: { $in: [BookingStatus.CONFIRMED, BookingStatus.PENDING_PAYMENT] } }).exec() as Promise<HotelBookingRecord[]>; }
  private bookingOverlappingRoom(id: Types.ObjectId, period: DateRange, bookings: HotelBookingRecord[]) { return bookings.find((booking) => booking.rooms.some((room) => room.roomId.toString() === id.toString()) && this.rangesOverlap(this.bookingRange(booking), period)); }
  private bookingRange(booking: HotelBooking): DateRange { const startDate = new Date(booking.startDate); startDate.setUTCHours(0, 0, 0, 0); const endDate = new Date(startDate); endDate.setUTCDate(endDate.getUTCDate() + booking.nightsCount); return { startDate, endDate }; }
  private async assertNoProtectedReservations(id: Types.ObjectId, action: string) { if ((await this.protectedBookingsForRooms([id])).length) throw new ConflictException(`Cannot ${action} a room with a Confirmed or Pending Payment reservation.`); }
  private async assertNoProtectedReservationsOverlapping(id: Types.ObjectId, range: DateRange, action: string) { if (this.bookingOverlappingRoom(id, range, await this.protectedBookingsForRooms([id]))) throw new ConflictException(`Cannot ${action} dates with a Confirmed or Pending Payment reservation.`); }
  private async assertProtectedReservationsRemainBookable(id: Types.ObjectId, availability: DateRange[]) { const bookings = await this.protectedBookingsForRooms([id]); if (bookings.some((booking) => !availability.some((range) => this.rangeContains(range, this.bookingRange(booking))))) throw new ConflictException('Availability cannot be removed for a Confirmed or Pending Payment reservation.'); }
  private timeToMinutes(value: string, field: string) { const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value); if (!match) throw new BadRequestException(`${field} must use HH:mm (24-hour) format.`); return Number(match[1]) * 60 + Number(match[2]); }
  private minutesToTime(value: number) { return `${Math.floor(value / 60).toString().padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`; }
}

function isDuplicateKeyError(error: unknown): boolean { return typeof error === 'object' && error !== null && 'code' in error && (error as { code?: unknown }).code === 11000; }
