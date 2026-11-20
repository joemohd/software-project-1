import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { City } from '../database/schemas/city.schema.js';
import { Country } from '../database/schemas/country.schema.js';
import { Currency } from '../database/schemas/currency.schema.js';
import { Expense } from '../database/schemas/expense.schema.js';
import { User } from '../database/schemas/user.schema.js';
import type {
  CityGroupDto,
  CityRefDto,
  ItineraryDetailDto,
  ItinerarySummaryDto,
  LinkedBookingDto,
} from './dto/itinerary-response.dto.js';
import { cityGroups, dayDate, isoDate } from './itinerary-rules.js';
import { imageIdFromUrl, type ItineraryRecord } from './itinerary.types.js';
import { PLATFORM_CURRENCY, PLATFORM_MINOR_UNITS } from './itineraries.constants.js';

// ITN-27: the raw fields read from a flight / hotel booking in the expenses collection
export interface BookingRecord {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  expenseType: string;
  name: string;
  cost?: number | null;
  status?: string;
  reference?: string | null;
  startDate?: Date | null;
  nightsCount?: number | null;
}

export const BOOKING_TYPES: Record<string, 'flight' | 'hotel'> = {
  flight_booking: 'flight',
  hotel_booking: 'hotel',
};

/**
 * Builds API responses for itineraries (names of cities and authors resolved in batches)
 * and checks references against the seeded reference data (GEN-12).
 */
@Injectable()
export class ItineraryPresenter {
  constructor(
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
    @InjectModel(Currency.name) private readonly currencyModel: Model<Currency>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Expense.name) private readonly expenseModel: Model<Expense>,
  ) {}

  // ---- ITN-27: linked bookings ----

  async findBookings(ids: Types.ObjectId[]): Promise<BookingRecord[]> {
    const unique = [...new Set(ids.map((id) => id.toString()))];
    if (!unique.length) return [];
    return this.expenseModel
      .find({
        _id: { $in: unique.map((id) => new Types.ObjectId(id)) },
        expenseType: { $in: Object.keys(BOOKING_TYPES) as Expense['expenseType'][] },
      })
      .select('userId expenseType name cost status reference startDate nightsCount')
      .lean<BookingRecord[]>()
      .exec();
  }

  toLinkedBooking(booking: BookingRecord): LinkedBookingDto {
    return {
      id: booking._id.toString(),
      type: BOOKING_TYPES[booking.expenseType],
      name: booking.name,
      reference: booking.reference ?? null,
      status: booking.status ?? '',
      amount: (booking.cost ?? 0) / PLATFORM_MINOR_UNITS,
      currency: PLATFORM_CURRENCY,
      checkIn: booking.startDate ? isoDate(new Date(booking.startDate)) : null,
      nights: booking.nightsCount ?? null,
    };
  }

  async linkedBookings(itinerary: ItineraryRecord): Promise<Map<string, LinkedBookingDto>> {
    const bookings = await this.findBookings(itinerary.days.flatMap((day) => day.bookingIds ?? []));
    return new Map(bookings.map((booking) => [booking._id.toString(), this.toLinkedBooking(booking)]));
  }

  // ---- reference-data checks ----

  /** ITN-01: countries must come from the predefined list. */
  async assertCountries(codes: string[]): Promise<void> {
    const unique = [...new Set(codes)];
    const found = await this.countryModel
      .find({ code: { $in: unique } })
      .select('code')
      .lean<{ code: string }[]>()
      .exec();
    const known = new Set(found.map((country) => country.code));
    const unknown = unique.filter((code) => !known.has(code));
    if (unknown.length) throw new BadRequestException(`Unknown country code(s): ${unknown.join(', ')}.`);
  }

  /** ITN-05: cities must come from the shared city list. */
  async assertCities(ids: Types.ObjectId[]): Promise<void> {
    const unique = [...new Set(ids.map((id) => id.toString()))];
    const count = await this.cityModel.countDocuments({ _id: { $in: unique } }).exec();
    if (count !== unique.length) throw new BadRequestException('Unknown city id.');
  }

  /** ITN-14, ITN-16, ITN-18: only currencies of the supported list are accepted. */
  async assertCurrencies(codes: string[]): Promise<void> {
    const unique = [...new Set(codes)];
    const found = await this.currencyModel
      .find({ currency: { $in: unique } })
      .select('currency')
      .lean<{ currency: string }[]>()
      .exec();
    const known = new Set(found.map((currency) => currency.currency));
    const unknown = unique.filter((code) => !known.has(code));
    if (unknown.length) throw new BadRequestException(`Unsupported currency code(s): ${unknown.join(', ')}.`);
  }

  // ---- name lookups ----

  async cityNames(ids: Types.ObjectId[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.map((id) => id.toString()))];
    if (!unique.length) return new Map();
    const cities = await this.cityModel
      .find({ _id: { $in: unique } })
      .select('name')
      .lean<{ _id: Types.ObjectId; name: string }[]>()
      .exec();
    return new Map(cities.map((city) => [city._id.toString(), city.name]));
  }

  async authorNames(ids: Types.ObjectId[]): Promise<Map<string, string>> {
    const unique = [...new Set(ids.map((id) => id.toString()))];
    if (!unique.length) return new Map();
    const users = await this.userModel
      .find({ _id: { $in: unique } })
      .select('fullName')
      .lean<{ _id: Types.ObjectId; fullName: string }[]>()
      .exec();
    return new Map(users.map((user) => [user._id.toString(), user.fullName]));
  }

  cityRef(id: Types.ObjectId, names: Map<string, string>): CityRefDto {
    return { id: id.toString(), name: names.get(id.toString()) ?? '' };
  }

  groupsOf(itinerary: ItineraryRecord, names: Map<string, string>): CityGroupDto[] {
    return cityGroups(
      itinerary.startDate,
      itinerary.days.map((day) => day.cityId.toString()),
    ).map(({ cityId, ...group }) => ({
      ...group,
      city: { id: cityId, name: names.get(cityId) ?? '' },
    }));
  }

  // ---- responses ----

  /** includeBookings is false for the public read-only view: another user's bookings stay private. */
  async detail(itinerary: ItineraryRecord, { includeBookings = true } = {}): Promise<ItineraryDetailDto> {
    const cityIds = [
      ...itinerary.days.map((day) => day.cityId),
      ...itinerary.transportCosts.flatMap((cost) => [cost.fromCityId, cost.toCityId]),
    ];
    const [names, authors, bookings] = await Promise.all([
      this.cityNames(cityIds),
      this.authorNames([itinerary.userId]),
      includeBookings ? this.linkedBookings(itinerary) : Promise.resolve(new Map<string, LinkedBookingDto>()),
    ]);
    const dayNumberById = new Map(itinerary.days.map((day, index) => [day._id.toString(), index + 1]));
    const dayCount = itinerary.days.length;

    return {
      id: itinerary._id.toString(),
      title: itinerary.title,
      countries: itinerary.countries ?? [],
      startDate: isoDate(itinerary.startDate),
      endDate: dayCount ? isoDate(dayDate(itinerary.startDate, dayCount)) : null,
      visibility: itinerary.visibility,
      dayCount,
      author: {
        id: itinerary.userId.toString(),
        name: authors.get(itinerary.userId.toString()) ?? '',
      },
      clonedFrom: itinerary.clonedFrom
        ? {
            itineraryId: itinerary.clonedFrom.itineraryId.toString(),
            author: {
              id: itinerary.clonedFrom.authorId.toString(),
              name: itinerary.clonedFrom.authorName,
            },
            title: itinerary.clonedFrom.title,
          }
        : null,
      days: itinerary.days.map((day, index) => ({
        id: day._id.toString(),
        dayNumber: index + 1,
        date: isoDate(dayDate(itinerary.startDate, index + 1)),
        city: this.cityRef(day.cityId, names),
        notes: day.notes ?? '',
        activities: (day.activities ?? []).map((activity) => ({
          id: activity._id.toString(),
          name: activity.name,
          description: activity.description ?? '',
          time: activity.time ?? null,
          cost: activity.cost ?? null,
          currency: activity.currency ?? null,
          images: (activity.imageUrls ?? []).map((url) => ({ id: imageIdFromUrl(url), url })),
        })),
        budgets: (day.budgets ?? []).map((budget) => ({
          id: budget._id.toString(),
          category: budget.category,
          amount: budget.amount,
          currency: budget.currency,
          note: budget.note ?? '',
        })),
        bookings: (day.bookingIds ?? [])
          .map((id) => bookings.get(id.toString()))
          .filter((booking): booking is LinkedBookingDto => !!booking),
      })),
      transportCosts: itinerary.transportCosts.map((cost) => ({
        id: cost._id.toString(),
        mode: cost.mode,
        fromCity: this.cityRef(cost.fromCityId, names),
        toCity: this.cityRef(cost.toCityId, names),
        amount: cost.amount,
        currency: cost.currency,
        dayId: cost.dayId.toString(),
        dayNumber: dayNumberById.get(cost.dayId.toString()) ?? 0,
      })),
      cityGroups: this.groupsOf(itinerary, names),
      createdAt: itinerary.createdAt,
      updatedAt: itinerary.updatedAt,
    };
  }

  summary(itinerary: ItineraryRecord): ItinerarySummaryDto {
    return {
      id: itinerary._id.toString(),
      title: itinerary.title,
      countries: itinerary.countries ?? [],
      startDate: isoDate(itinerary.startDate),
      dayCount: itinerary.days?.length ?? 0,
      visibility: itinerary.visibility,
      updatedAt: itinerary.updatedAt,
    };
  }
}
