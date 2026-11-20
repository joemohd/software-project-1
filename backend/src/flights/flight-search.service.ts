import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { DateTime } from 'luxon';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Airport } from '../database/schemas/airport.schema.js';
import { City } from '../database/schemas/city.schema.js';
import { CabinType, Flight, FlightStatus, SeatAvailability } from '../database/schemas/flight.schema.js';
import { Airline, ProviderStatus } from '../database/schemas/provider.schema.js';
import { segmentFare } from '../flight-bookings/booking-rules.js';
import { FlightBookingsService } from '../flight-bookings/flight-bookings.service.js';
import {
  FlightSearchCabinDto,
  FlightSearchItemDto,
  FlightSearchLegPageDto,
  FlightSortBy,
  SearchFlightsQueryDto,
  SearchFlightsResponseDto,
  SortOrder,
} from './dto/search-flights.dto.js';
import { utcToLocal } from './flight-time.js';
import { PAGE_SIZE } from './flights.constants.js';

type AirportRecord = { _id: Types.ObjectId; iataCode: string; name: string; cityId: Types.ObjectId };
type CityRecord = { _id: Types.ObjectId; timeZone?: string };
type AirlineRecord = { _id: Types.ObjectId; name: string; iataCode: string; logoUrl?: string; status: ProviderStatus };
type FlightRecord = Flight & { _id: Types.ObjectId };

export interface MultiAirportFlightSearchOptions {
  departureAirportIds: string[];
  arrivalAirportIds: string[];
  departureDate: string;
  returnDate?: string;
  adults: number;
  children: number;
  infants: number;
  cabin?: CabinType;
  minPrice?: number;
  maxPrice?: number;
  sortBy?: FlightSortBy;
  sortOrder?: SortOrder;
  page?: number;
}

@Injectable()
export class FlightSearchService {
  constructor(
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<Airline>,
    @InjectModel(Airport.name) private readonly airportModel: Model<Airport>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @Optional() private readonly flightBookingsService?: FlightBookingsService,
  ) {}

  // FLT-11, FLT-12, FLT-15: guest or registered user searches one-way or round-trip flights
  async search(dto: SearchFlightsQueryDto): Promise<SearchFlightsResponseDto> {
    const adults = dto.adults ?? dto.passengers ?? 1;
    const children = dto.children ?? 0;
    const infants = dto.infants ?? 0;

    return this.searchForAirports({
      departureAirportIds: [dto.departureAirportId],
      arrivalAirportIds: [dto.arrivalAirportId],
      departureDate: dto.departureDate,
      returnDate: dto.returnDate,
      adults,
      children,
      infants,
      cabin: dto.cabin,
      minPrice: dto.minPrice,
      maxPrice: dto.maxPrice,
      sortBy: dto.sortBy,
      sortOrder: dto.sortOrder ?? 'asc',
      page: dto.page ?? 1,
    });
  }

  /**
   * FLT-11, FLT-12, FLT-15, ITN-26: searches flights between one or more departure airports and one or more
   * arrival airports (used both for direct airport-to-airport search and for ITN-26 city-airport search).
   */
  async searchForAirports(options: MultiAirportFlightSearchOptions): Promise<SearchFlightsResponseDto> {
    const adults = options.adults;
    const children = options.children;
    const infants = options.infants;
    const page = options.page ?? 1;
    const sortOrder = options.sortOrder ?? 'asc';

    // FLT-12(b): at least one adult, and no more infants than adults
    if (adults < 1) {
      throw new BadRequestException('At least one adult passenger is required.');
    }
    if (infants > adults) {
      throw new BadRequestException('Number of infants cannot exceed number of adults.');
    }

    // FLT-15: inclusive min/max price filter; error if min > max
    if (options.minPrice !== undefined && options.maxPrice !== undefined && options.minPrice > options.maxPrice) {
      throw new BadRequestException('minPrice cannot be greater than maxPrice.');
    }

    this.assertValidCalendarDate(options.departureDate, 'departureDate');
    if (options.returnDate !== undefined) {
      this.assertValidCalendarDate(options.returnDate, 'returnDate');
      if (options.returnDate < options.departureDate) {
        throw new BadRequestException('returnDate cannot be earlier than departureDate.');
      }
    }

    const departureIds = [...new Set(options.departureAirportIds)];
    const arrivalIds = [...new Set(options.arrivalAirportIds)];
    if (!departureIds.length || !arrivalIds.length) {
      throw new BadRequestException('Departure and arrival airports are required.');
    }
    if (departureIds.some((id) => arrivalIds.includes(id))) {
      throw new BadRequestException('Departure and arrival airports must be different.');
    }

    const allAirportIds = [...new Set([...departureIds, ...arrivalIds])];
    for (const id of allAirportIds) {
      if (!isValidObjectId(id)) {
        throw new BadRequestException(`Airport "${id}" is not in the airport list (GET /api/airports).`);
      }
    }

    const airports = await this.airportModel
      .find({ _id: { $in: allAirportIds.map((id) => new Types.ObjectId(id)) } })
      .select('iataCode name cityId')
      .lean<AirportRecord[]>()
      .exec();

    const airportMap = new Map(airports.map((airport) => [airport._id.toString(), airport]));
    for (const depId of departureIds) {
      if (!airportMap.has(depId)) {
        throw new BadRequestException('Departure airport is not in the airport list (GET /api/airports).');
      }
    }
    for (const arrId of arrivalIds) {
      if (!airportMap.has(arrId)) {
        throw new BadRequestException('Arrival airport is not in the airport list (GET /api/airports).');
      }
    }

    const cities = await this.cityModel
      .find({ _id: { $in: airports.map((airport) => airport.cityId) } })
      .select('timeZone')
      .lean<CityRecord[]>()
      .exec();
    const zoneByCityId = new Map(cities.map((city) => [city._id.toString(), city.timeZone]));

    const zoneByAirportId = new Map<string, string>();
    for (const airport of airports) {
      const zone = zoneByCityId.get(airport.cityId?.toString());
      if (!zone) {
        throw new BadRequestException(
          `Airport ${airport.iataCode}'s city has no time zone set, so its local date cannot be converted.`,
        );
      }
      zoneByAirportId.set(airport._id.toString(), zone);
    }

    // Release any expired 10-minute seat holds before checking available seats (FLT-11, FLT-22)
    if (this.flightBookingsService) {
      await this.flightBookingsService.expireOverdueHolds();
    }

    // FLT-11: only active airlines' flights are listed
    const activeAirlines = await this.airlineModel
      .find({ status: ProviderStatus.ACTIVE })
      .select('name iataCode logoUrl status')
      .lean<AirlineRecord[]>()
      .exec();
    const airlineMap = new Map(activeAirlines.map((airline) => [airline._id.toString(), airline]));

    const seatsRequired = adults + children;
    const outboundMatches = await this.findMatchingFlights({
      departureAirportIds: departureIds,
      arrivalAirportIds: arrivalIds,
      localDate: options.departureDate,
      seatsRequired,
      infants,
      cabin: options.cabin,
      minPrice: options.minPrice,
      maxPrice: options.maxPrice,
      sortBy: options.sortBy,
      sortOrder,
      airportMap,
      zoneByAirportId,
      airlineMap,
    });

    const outboundPage = this.paginate(outboundMatches, page);

    let returnPage: FlightSearchLegPageDto | null = null;
    if (options.returnDate !== undefined) {
      // In a round-trip search, a return flight must depart after at least one matching outbound flight arrives
      const earliestOutboundArrival = outboundMatches.length
        ? new Date(Math.min(...outboundMatches.map((flight) => new Date(flight.arrival.timestamp).getTime())))
        : undefined;

      const returnMatches =
        outboundMatches.length === 0 && options.returnDate === options.departureDate
          ? await this.findMatchingFlights({
              departureAirportIds: arrivalIds,
              arrivalAirportIds: departureIds,
              localDate: options.returnDate,
              seatsRequired,
              infants,
              cabin: options.cabin,
              minPrice: options.minPrice,
              maxPrice: options.maxPrice,
              sortBy: options.sortBy,
              sortOrder,
              airportMap,
              zoneByAirportId,
              airlineMap,
            })
          : await this.findMatchingFlights({
              departureAirportIds: arrivalIds,
              arrivalAirportIds: departureIds,
              localDate: options.returnDate,
              minDepartureAfterUtc: earliestOutboundArrival,
              seatsRequired,
              infants,
              cabin: options.cabin,
              minPrice: options.minPrice,
              maxPrice: options.maxPrice,
              sortBy: options.sortBy,
              sortOrder,
              airportMap,
              zoneByAirportId,
              airlineMap,
            });

      returnPage = this.paginate(returnMatches, page);
    }

    const isRoundTrip = options.returnDate !== undefined;
    const noMatches = isRoundTrip
      ? outboundPage.total === 0 || (returnPage !== null && returnPage.total === 0)
      : outboundPage.total === 0;

    return {
      tripType: isRoundTrip ? 'round-trip' : 'one-way',
      passengers: {
        adults,
        children,
        infants,
        seatsRequired,
      },
      outbound: outboundPage,
      return: returnPage,
      message: noMatches ? 'No flights found.' : null,
    };
  }

  private async findMatchingFlights(params: {
    departureAirportIds: string[];
    arrivalAirportIds: string[];
    localDate: string;
    minDepartureAfterUtc?: Date;
    seatsRequired: number;
    infants: number;
    cabin?: CabinType;
    minPrice?: number;
    maxPrice?: number;
    sortBy?: FlightSortBy;
    sortOrder: SortOrder;
    airportMap: Map<string, AirportRecord>;
    zoneByAirportId: Map<string, string>;
    airlineMap: Map<string, AirlineRecord>;
  }): Promise<FlightSearchItemDto[]> {
    if (params.airlineMap.size === 0) return [];

    const now = new Date();
    const minDepartureFloor =
      params.minDepartureAfterUtc && params.minDepartureAfterUtc > now ? params.minDepartureAfterUtc : now;

    // Build per-departure-airport UTC day bounds for the local date in each departure airport's time zone
    const departureOrClauses: Record<string, unknown>[] = [];
    for (const depId of params.departureAirportIds) {
      const zone = params.zoneByAirportId.get(depId)!;
      const startLocal = DateTime.fromISO(params.localDate, { zone }).startOf('day');
      const dayStartUtc = startLocal.toUTC().toJSDate();
      const dayEndUtc = startLocal.plus({ days: 1 }).toUTC().toJSDate();
      if (dayEndUtc <= minDepartureFloor) continue;

      const lowerBound = dayStartUtc > minDepartureFloor ? dayStartUtc : minDepartureFloor;
      departureOrClauses.push({
        'departure.airportId': new Types.ObjectId(depId),
        'departure.timestamp':
          dayStartUtc > minDepartureFloor
            ? { $gte: lowerBound, $lt: dayEndUtc }
            : { $gt: lowerBound, $lt: dayEndUtc },
      });
    }

    if (!departureOrClauses.length) return [];

    const activeAirlineIds = [...params.airlineMap.keys()].map((id) => new Types.ObjectId(id));
    const arrivalObjectIds = params.arrivalAirportIds.map((id) => new Types.ObjectId(id));

    const flights = await this.flightModel
      .find({
        status: FlightStatus.SCHEDULED,
        airlineId: { $in: activeAirlineIds },
        'arrival.airportId': { $in: arrivalObjectIds },
        ...(departureOrClauses.length === 1 ? departureOrClauses[0] : { $or: departureOrClauses }),
      })
      .lean<FlightRecord[]>()
      .exec();

    const results: FlightSearchItemDto[] = [];
    for (const flight of flights) {
      const airline = params.airlineMap.get(flight.airlineId.toString());
      if (!airline) continue;

      const depAirport = params.airportMap.get(flight.departure.airportId.toString());
      const arrAirport = params.airportMap.get(flight.arrival.airportId.toString());
      const depZone = params.zoneByAirportId.get(flight.departure.airportId.toString());
      const arrZone = params.zoneByAirportId.get(flight.arrival.airportId.toString());
      if (!depAirport || !arrAirport || !depZone || !arrZone) continue;

      // Filter cabins by optional cabin class, seat availability (total - booked - held), and price bounds
      const qualifyingCabins: FlightSearchCabinDto[] = [];
      for (const cabin of flight.cabins) {
        if (params.cabin !== undefined && cabin.name !== params.cabin) continue;
        if (params.minPrice !== undefined && cabin.seatPrice < params.minPrice) continue;
        if (params.maxPrice !== undefined && cabin.seatPrice > params.maxPrice) continue;

        const availableSeats = cabin.seats.filter(
          (seat) => seat.availability === SeatAvailability.AVAILABLE,
        ).length;
        if (availableSeats < params.seatsRequired) continue;

        qualifyingCabins.push({
          name: cabin.name,
          seatPrice: cabin.seatPrice,
          freeBagWeight: cabin.freeBagWeight,
          seatCount: cabin.seats.length,
          availableSeats,
          totalFare: segmentFare(cabin.seatPrice, params.seatsRequired, params.infants),
        });
      }

      if (!qualifyingCabins.length) continue;

      qualifyingCabins.sort((a, b) => a.seatPrice - b.seatPrice);
      const lowestSeatPrice = qualifyingCabins[0].seatPrice;
      const lowestTotalFare = qualifyingCabins[0].totalFare;
      const durationMinutes = Math.round(
        (flight.arrival.timestamp.getTime() - flight.departure.timestamp.getTime()) / 60000,
      );

      results.push({
        id: flight._id.toString(),
        airline: {
          id: airline._id.toString(),
          name: airline.name,
          iataCode: airline.iataCode,
          logoUrl: airline.logoUrl ?? null,
        },
        number: flight.number,
        status: flight.status,
        departure: {
          airportId: depAirport._id.toString(),
          iataCode: depAirport.iataCode,
          airportName: depAirport.name,
          timestamp: flight.departure.timestamp.toISOString(),
          localTime: utcToLocal(flight.departure.timestamp, depZone),
          timeZone: depZone,
        },
        arrival: {
          airportId: arrAirport._id.toString(),
          iataCode: arrAirport.iataCode,
          airportName: arrAirport.name,
          timestamp: flight.arrival.timestamp.toISOString(),
          localTime: utcToLocal(flight.arrival.timestamp, arrZone),
          timeZone: arrZone,
        },
        durationMinutes,
        maxBagWeight: flight.maxBagWeight,
        lowestSeatPrice,
        lowestTotalFare,
        cabins: qualifyingCabins,
      });
    }

    const direction = params.sortOrder === 'desc' ? -1 : 1;
    const sortBy = params.sortBy ?? 'departureTime';
    results.sort((a, b) => {
      let diff = 0;
      if (sortBy === 'price') {
        diff = (a.lowestSeatPrice - b.lowestSeatPrice) * direction;
      } else if (sortBy === 'duration') {
        diff = (a.durationMinutes - b.durationMinutes) * direction;
      } else {
        diff = (new Date(a.departure.timestamp).getTime() - new Date(b.departure.timestamp).getTime()) * direction;
      }
      if (diff !== 0) return diff;
      // Tie-breakers: earliest departure, then lowest price, then id
      const timeDiff = new Date(a.departure.timestamp).getTime() - new Date(b.departure.timestamp).getTime();
      if (timeDiff !== 0) return timeDiff;
      const priceDiff = a.lowestSeatPrice - b.lowestSeatPrice;
      if (priceDiff !== 0) return priceDiff;
      return a.id.localeCompare(b.id);
    });

    return results;
  }

  private assertValidCalendarDate(dateStr: string, label: string): void {
    const parsed = DateTime.fromISO(dateStr, { zone: 'utc' });
    if (!parsed.isValid || parsed.toISODate() !== dateStr) {
      throw new BadRequestException(`${label} "${dateStr}" is not a valid calendar date.`);
    }
  }

  private paginate(items: FlightSearchItemDto[], page: number): FlightSearchLegPageDto {
    const total = items.length;
    const start = (page - 1) * PAGE_SIZE;
    return {
      items: items.slice(start, start + PAGE_SIZE),
      page,
      pageSize: PAGE_SIZE,
      total,
      totalPages: Math.ceil(total / PAGE_SIZE),
    };
  }
}
