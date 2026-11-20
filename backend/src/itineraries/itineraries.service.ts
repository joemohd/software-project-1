import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { isValidObjectId, Model, Types } from 'mongoose';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { Airport } from '../database/schemas/airport.schema.js';
import { City } from '../database/schemas/city.schema.js';
import { Expense } from '../database/schemas/expense.schema.js';
import { Itinerary, ItineraryDay, ItineraryVisibility } from '../database/schemas/itinerary.schema.js';
import { Hotel, Room } from '../database/schemas/provider.schema.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { FlightSearchService } from '../flights/flight-search.service.js';
import {
  ItineraryFlightSearchResponseDto,
  SearchItineraryFlightsQueryDto,
} from './dto/search-itinerary-flights.dto.js';

type ItineraryRecord = Itinerary & { _id: Types.ObjectId };
type CityRecord = { _id: Types.ObjectId; name: string };
type AirportIdRecord = { _id: Types.ObjectId };
type ExpenseCityRecord = {
  _id: Types.ObjectId;
  expenseType?: string;
  cityId?: Types.ObjectId;
  toCityId?: Types.ObjectId;
  fromCityId?: Types.ObjectId;
  rooms?: { roomId: Types.ObjectId }[];
};

@Injectable()
export class ItinerariesService {
  constructor(
    @InjectModel(Itinerary.name) private readonly itineraryModel: Model<Itinerary>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectModel(Airport.name) private readonly airportModel: Model<Airport>,
    @InjectModel(Expense.name) private readonly expenseModel: Model<Expense>,
    @InjectModel(Room.name) private readonly roomModel: Model<Room>,
    @InjectModel(Hotel.name) private readonly hotelModel: Model<Hotel>,
    private readonly flightSearchService: FlightSearchService,
  ) {}

  /**
   * ITN-26: searches one-way or round-trip flights from a chosen origin airport to any airport in the city of the
   * itinerary's first day. Outbound date defaults to startDate and returnDate to the last day's date, reusing
   * FLT-11, FLT-12 and FLT-15 via FlightSearchService.
   */
  async searchFlights(
    user: AuthenticatedUser,
    itineraryId: string,
    query: SearchItineraryFlightsQueryDto,
  ): Promise<ItineraryFlightSearchResponseDto> {
    if (!isValidObjectId(itineraryId)) throw new NotFoundException('Itinerary not found.');
    const itinerary = await this.itineraryModel.findById(itineraryId).lean<ItineraryRecord>().exec();
    if (!itinerary) throw new NotFoundException('Itinerary not found.');

    const isOwner = itinerary.userId.toString() === user.id;
    const isAdmin = user.role === UserRole.ADMIN;
    if (!isOwner && !isAdmin) {
      if (itinerary.isHidden) throw new NotFoundException('Itinerary not found.');
      if (itinerary.visibility !== ItineraryVisibility.PUBLIC) {
        throw new ForbiddenException('You do not have permission to access this private itinerary.');
      }
    }

    if (!itinerary.days?.length) {
      throw new BadRequestException('This itinerary has no days configured.');
    }

    const firstDayCityId = await this.resolveDayCityId(itinerary.days[0]);
    if (!firstDayCityId) {
      throw new BadRequestException("The itinerary's first day does not have a city assigned.");
    }

    const destinationCity = await this.cityModel
      .findById(firstDayCityId)
      .select('name')
      .lean<CityRecord>()
      .exec();
    if (!destinationCity) {
      throw new BadRequestException("The city of the itinerary's first day was not found.");
    }

    const startIsoDate = DateTime.fromJSDate(new Date(itinerary.startDate), { zone: 'utc' }).toISODate();
    const lastDayIsoDate = DateTime.fromJSDate(new Date(itinerary.startDate), { zone: 'utc' })
      .plus({ days: Math.max(0, itinerary.days.length - 1) })
      .toISODate();
    if (!startIsoDate || !lastDayIsoDate) {
      throw new BadRequestException('Itinerary startDate is invalid.');
    }

    const isRoundTrip =
      query.tripType === 'round-trip' || (query.tripType === undefined && query.returnDate !== undefined);
    const outboundDate = query.departureDate ?? startIsoDate;
    const effectiveReturnDate = isRoundTrip ? (query.returnDate ?? lastDayIsoDate) : undefined;

    const destinationAirports = await this.airportModel
      .find({ cityId: destinationCity._id })
      .select('_id')
      .lean<AirportIdRecord[]>()
      .exec();
    const destinationAirportIds = destinationAirports.map((airport) => airport._id.toString());

    const adults = query.adults ?? query.passengers ?? 1;
    const children = query.children ?? 0;
    const infants = query.infants ?? 0;
    const page = query.page ?? 1;

    // If the destination city has no airports at all, still validate origin airport and query parameters
    if (destinationAirportIds.length === 0) {
      const originExists =
        isValidObjectId(query.originAirportId) &&
        Boolean(await this.airportModel.exists({ _id: new Types.ObjectId(query.originAirportId) }).exec());
      if (!originExists) {
        throw new BadRequestException('Departure airport is not in the airport list (GET /api/airports).');
      }
      if (infants > adults) {
        throw new BadRequestException('Number of infants cannot exceed number of adults.');
      }
      if (query.minPrice !== undefined && query.maxPrice !== undefined && query.minPrice > query.maxPrice) {
        throw new BadRequestException('minPrice cannot be greater than maxPrice.');
      }
      if (effectiveReturnDate !== undefined && effectiveReturnDate < outboundDate) {
        throw new BadRequestException('returnDate cannot be earlier than departureDate.');
      }

      const emptyPage = { items: [], page, pageSize: 10, total: 0, totalPages: 0 };
      return {
        itineraryId: itinerary._id.toString(),
        destinationCity: { id: destinationCity._id.toString(), name: destinationCity.name },
        destinationAirportIds: [],
        outboundDate,
        returnDate: effectiveReturnDate ?? null,
        tripType: isRoundTrip ? 'round-trip' : 'one-way',
        passengers: { adults, children, infants, seatsRequired: adults + children },
        outbound: emptyPage,
        return: isRoundTrip ? emptyPage : null,
        message: 'No flights found.',
      };
    }

    const searchResult = await this.flightSearchService.searchForAirports({
      departureAirportIds: [query.originAirportId],
      arrivalAirportIds: destinationAirportIds,
      departureDate: outboundDate,
      returnDate: effectiveReturnDate,
      adults,
      children,
      infants,
      cabin: query.cabin,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sortBy: query.sortBy,
      sortOrder: query.sortOrder ?? 'asc',
      page,
    });

    return {
      tripType: searchResult.tripType,
      passengers: searchResult.passengers,
      outbound: searchResult.outbound,
      return: searchResult.return,
      message: searchResult.message,
      itineraryId: itinerary._id.toString(),
      destinationCity: { id: destinationCity._id.toString(), name: destinationCity.name },
      destinationAirportIds,
      outboundDate,
      returnDate: effectiveReturnDate ?? null,
    };
  }

  /**
   * Resolves the city of an itinerary day: reads `day.cityId` directly (ITN-05), or falls back to inspecting the
   * day's expenses (Activity.cityId, Transport.toCityId/fromCityId, or HotelBooking's hotel cityId).
   */
  private async resolveDayCityId(day: ItineraryDay): Promise<Types.ObjectId | null> {
    if (day.cityId) return new Types.ObjectId(day.cityId);
    if (!day.expenseIds?.length) return null;

    const expenses = await this.expenseModel
      .find({ _id: { $in: day.expenseIds } })
      .select('expenseType cityId toCityId fromCityId rooms')
      .lean<ExpenseCityRecord[]>()
      .exec();

    const byId = new Map(expenses.map((expense) => [expense._id.toString(), expense]));
    for (const expenseId of day.expenseIds) {
      const expense = byId.get(expenseId.toString());
      if (!expense) continue;
      if (expense.cityId) return new Types.ObjectId(expense.cityId);
      if (expense.toCityId) return new Types.ObjectId(expense.toCityId);
      if (expense.fromCityId) return new Types.ObjectId(expense.fromCityId);
      const firstRoomId = expense.rooms?.[0]?.roomId;
      if (firstRoomId) {
        const room = await this.roomModel.findById(firstRoomId).select('hotelId').lean<{ hotelId: Types.ObjectId }>().exec();
        if (room) {
          const hotel = await this.hotelModel.findById(room.hotelId).select('cityId').lean<{ cityId: Types.ObjectId }>().exec();
          if (hotel?.cityId) return new Types.ObjectId(hotel.cityId);
        }
      }
    }
    return null;
  }
}
