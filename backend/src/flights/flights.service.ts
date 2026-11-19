import { BadRequestException, ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Airport } from '../database/schemas/airport.schema.js';
import { City } from '../database/schemas/city.schema.js';
import { Flight, FlightStatus, SeatAvailability } from '../database/schemas/flight.schema.js';
import { ProviderStatus } from '../database/schemas/provider.schema.js';
import { AirlinesService } from './airlines.service.js';
import { buildCabins } from './cabin-seats.js';
import { CreateFlightDto } from './dto/create-flight.dto.js';
import { FlightResponseDto } from './dto/flight-response.dto.js';
import { localDayBoundsUtc, localToUtc, utcToLocal } from './flight-time.js';

type AirportCityRecord = { _id: Types.ObjectId; cityId: Types.ObjectId };
type CityZoneRecord = { _id: Types.ObjectId; timeZone?: string };
type FlightRecord = Flight & { _id: Types.ObjectId };

const isDuplicateKeyError = (error: unknown) => (error as { code?: number } | null)?.code === 11000;

@Injectable()
export class FlightsService {
  constructor(
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(Airport.name) private readonly airportModel: Model<Airport>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    private readonly airlinesService: AirlinesService,
  ) {}

  // FLT-03 (with its FLT-04 cabins): a moderator creates a Scheduled flight for their own active airline
  async create(moderatorId: string, dto: CreateFlightDto): Promise<FlightResponseDto> {
    // Checks that need no database first
    if (dto.departureAirportId === dto.arrivalAirportId) {
      throw new BadRequestException('Departure and arrival airports must be different.');
    }
    const cabins = buildCabins(dto.cabins, dto.maxBagWeight);

    const airline = await this.airlinesService.findOwnedAirline(dto.airlineId, moderatorId);
    if (airline.status !== ProviderStatus.ACTIVE) {
      throw new ForbiddenException('This airline is deactivated, so it cannot create flights.');
    }

    const zones = await this.airportTimeZones(dto.departureAirportId, dto.arrivalAirportId);
    const departureAt = localToUtc(dto.departureLocalTime, zones.departure, 'Departure time');
    const arrivalAt = localToUtc(dto.arrivalLocalTime, zones.arrival, 'Arrival time');
    if (arrivalAt <= departureAt) {
      throw new BadRequestException('Arrival must be after departure (compared in UTC).');
    }
    if (departureAt <= new Date()) {
      throw new BadRequestException('Departure must be in the future.');
    }

    await this.assertNumberFreeOnLocalDate(airline._id, dto.number, departureAt, zones.departure);

    let flight: FlightRecord;
    try {
      flight = await this.flightModel.create({
        airlineId: airline._id,
        number: dto.number,
        status: FlightStatus.SCHEDULED,
        departure: { airportId: new Types.ObjectId(dto.departureAirportId), timestamp: departureAt },
        arrival: { airportId: new Types.ObjectId(dto.arrivalAirportId), timestamp: arrivalAt },
        maxBagWeight: dto.maxBagWeight,
        cabins,
      });
    } catch (error) {
      // The schema's unique index (airline, number, exact departure time) catches a concurrent duplicate
      if (isDuplicateKeyError(error)) throw this.duplicateNumberError(dto.number, departureAt, zones.departure);
      throw error;
    }

    return toFlightResponse(flight, zones.departure, zones.arrival);
  }

  /**
   * FLT-02/FLT-03: both airports must be in the predefined list, and their cities need an IANA time zone,
   * otherwise local times can't be converted to UTC.
   */
  private async airportTimeZones(departureId: string, arrivalId: string): Promise<{ departure: string; arrival: string }> {
    const airports = await this.airportModel
      .find({ _id: { $in: [departureId, arrivalId] } })
      .select('cityId')
      .lean<AirportCityRecord[]>()
      .exec();
    const cities = await this.cityModel
      .find({ _id: { $in: airports.map((airport) => airport.cityId) } })
      .select('timeZone')
      .lean<CityZoneRecord[]>()
      .exec();

    const zoneOf = (airportId: string, label: string) => {
      const airport = airports.find((candidate) => candidate._id.toString() === airportId);
      if (!airport) throw new BadRequestException(`${label} airport is not in the airport list (GET /api/airports).`);
      const timeZone = cities.find((city) => city._id.toString() === airport.cityId?.toString())?.timeZone;
      if (!timeZone) {
        throw new BadRequestException(`${label} airport's city has no time zone set, so its local time can't be converted.`);
      }
      return timeZone;
    };

    return { departure: zoneOf(departureId, 'Departure'), arrival: zoneOf(arrivalId, 'Arrival') };
  }

  // FLT-03: one flight number per airline per local departure date (local to the departure airport).
  // Cancelled flights don't count, so a cancelled flight's number can be reused that day.
  private async assertNumberFreeOnLocalDate(airlineId: Types.ObjectId, number: string, departureAt: Date, timeZone: string) {
    const { start, end } = localDayBoundsUtc(departureAt, timeZone);
    const taken = await this.flightModel
      .exists({
        airlineId,
        number,
        status: { $ne: FlightStatus.CANCELLED },
        'departure.timestamp': { $gte: start, $lt: end },
      })
      .exec();
    if (taken) throw this.duplicateNumberError(number, departureAt, timeZone);
  }

  private duplicateNumberError(number: string, departureAt: Date, timeZone: string) {
    const localDate = utcToLocal(departureAt, timeZone).slice(0, 10);
    return new ConflictException(`This airline already has flight ${number} departing on ${localDate}.`);
  }
}

export function toFlightResponse(flight: FlightRecord, departureZone: string, arrivalZone: string): FlightResponseDto {
  return {
    id: flight._id.toString(),
    airlineId: flight.airlineId.toString(),
    number: flight.number,
    status: flight.status,
    departure: {
      airportId: flight.departure.airportId.toString(),
      timestamp: flight.departure.timestamp.toISOString(),
      localTime: utcToLocal(flight.departure.timestamp, departureZone),
      timeZone: departureZone,
    },
    arrival: {
      airportId: flight.arrival.airportId.toString(),
      timestamp: flight.arrival.timestamp.toISOString(),
      localTime: utcToLocal(flight.arrival.timestamp, arrivalZone),
      timeZone: arrivalZone,
    },
    maxBagWeight: flight.maxBagWeight,
    cabins: flight.cabins.map((cabin) => ({
      name: cabin.name,
      seatPrice: cabin.seatPrice,
      freeBagWeight: cabin.freeBagWeight,
      seatCount: cabin.seats.length,
      availableSeats: cabin.seats.filter((seat) => seat.availability === SeatAvailability.AVAILABLE).length,
    })),
  };
}
