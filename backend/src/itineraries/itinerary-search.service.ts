import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Airport } from '../database/schemas/airport.schema.js';
import type {
  ItineraryFlightSearchDto,
  ItineraryHotelSearchDto,
} from './dto/itinerary-response.dto.js';
import type { ItineraryFlightsQueryDto, ItineraryHotelsQueryDto } from './dto/query.dto.js';
import { ItinerariesService } from './itineraries.service.js';
import { ItineraryPresenter } from './itinerary-presenter.service.js';
import { addDays, dayDate, isoDate } from './itinerary-rules.js';

type AirportRecord = { _id: Types.ObjectId; iataCode: string; name: string; cityId: Types.ObjectId };

/**
 * ITN-25, ITN-26: search hotels / flights from the itinerary context.
 * The dates and places are derived from the itinerary; the actual search is the shared
 * hotel search (HTL-11) and flight search (FLT-11, FLT-12), returned as ready-to-run requests.
 */
@Injectable()
export class ItinerarySearchService {
  constructor(
    @InjectModel(Airport.name) private readonly airportModel: Model<Airport>,
    private readonly itineraries: ItinerariesService,
    private readonly presenter: ItineraryPresenter,
  ) {}

  // ITN-25: check-in = first day of the city group, check-out = the day after its last day
  async hotels(userId: string, itineraryId: string, query: ItineraryHotelsQueryDto): Promise<ItineraryHotelSearchDto> {
    const itinerary = await this.itineraries.findOwned(userId, itineraryId);
    const names = await this.presenter.cityNames(itinerary.days.map((day) => day.cityId));
    const group = this.presenter.groupsOf(itinerary, names)[query.groupIndex];
    if (!group) {
      throw new NotFoundException('City group not found. Use an index from cityGroups in the itinerary details.');
    }

    const checkIn = group.startDate;
    const checkOut = isoDate(addDays(new Date(group.endDate), 1));
    return {
      group,
      checkIn,
      checkOut,
      guests: query.guests,
      rooms: query.rooms,
      search: {
        method: 'GET',
        path: '/api/hotels/search',
        query: { cityId: group.city.id, checkIn, checkOut, guests: query.guests, rooms: query.rooms },
      },
    };
  }

  // ITN-26: from a chosen origin airport to any airport in the city of the itinerary's first day
  async flights(userId: string, itineraryId: string, query: ItineraryFlightsQueryDto): Promise<ItineraryFlightSearchDto> {
    const itinerary = await this.itineraries.findOwned(userId, itineraryId);
    if (!itinerary.days.length) {
      throw new BadRequestException('Add at least one day before searching flights.');
    }

    const firstCityId = itinerary.days[0].cityId;
    const [origin, destinations, names] = await Promise.all([
      this.airportModel
        .findOne({ iataCode: query.origin })
        .select('iataCode name cityId')
        .lean<AirportRecord>()
        .exec(),
      this.airportModel
        .find({ cityId: firstCityId })
        .select('iataCode name cityId')
        .sort({ iataCode: 1 })
        .lean<AirportRecord[]>()
        .exec(),
      this.presenter.cityNames([firstCityId]),
    ]);
    if (!origin) throw new BadRequestException(`Unknown origin airport ${query.origin}.`);
    if (!destinations.length) {
      throw new NotFoundException("The first day's city has no airport.");
    }

    const outboundDate = query.outboundDate ?? isoDate(itinerary.startDate);
    const returnDate =
      query.tripType === 'round-trip'
        ? (query.returnDate ?? isoDate(dayDate(itinerary.startDate, itinerary.days.length)))
        : null;
    if (returnDate && returnDate < outboundDate) {
      throw new BadRequestException('returnDate must not be before outboundDate.');
    }

    const toRef = (airport: AirportRecord) => ({
      id: airport._id.toString(),
      iataCode: airport.iataCode,
      name: airport.name,
    });
    return {
      origin: toRef(origin),
      destinationCity: this.presenter.cityRef(firstCityId, names),
      destinationAirports: destinations.map(toRef),
      tripType: query.tripType,
      outboundDate,
      returnDate,
      passengers: { adults: query.adults, children: query.children, infants: query.infants },
      cabinClass: query.cabinClass ?? null,
      searches: destinations.map((destination) => ({
        method: 'GET',
        path: '/api/flights/search',
        query: {
          from: origin.iataCode,
          to: destination.iataCode,
          tripType: query.tripType,
          departureDate: outboundDate,
          ...(returnDate ? { returnDate } : {}),
          adults: query.adults,
          children: query.children,
          infants: query.infants,
          ...(query.cabinClass ? { cabinClass: query.cabinClass } : {}),
        },
      })),
    };
  }
}
