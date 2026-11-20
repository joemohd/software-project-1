import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Airport } from '../database/schemas/airport.schema.js';
import { City } from '../database/schemas/city.schema.js';
import { Cabin, Flight, FlightStatus, Seat, SeatAvailability } from '../database/schemas/flight.schema.js';
import { ProviderStatus } from '../database/schemas/provider.schema.js';
import { AirlinesService } from './airlines.service.js';
import {
  assertNoRowOverlap,
  assertRowOrder,
  buildCabins,
  layoutOf,
  RowRange,
  rowRangeOf,
  rowsBetween,
  seatsForRows,
} from './cabin-seats.js';
import { CreateCabinDto, CreateFlightDto } from './dto/create-flight.dto.js';
import { FlightResponseDto } from './dto/flight-response.dto.js';
import { UpdateCabinDto } from './dto/update-cabin.dto.js';
import { UpdateFlightDto } from './dto/update-flight.dto.js';
import { localDayBoundsUtc, localToUtc, utcToLocal } from './flight-time.js';

type AirportCityRecord = { _id: Types.ObjectId; cityId: Types.ObjectId };
type CityZoneRecord = { _id: Types.ObjectId; timeZone?: string };
type FlightRecord = Flight & { _id: Types.ObjectId };

const FLIGHT_NOT_FOUND = 'Flight not found.';
// Seats a passenger is holding or has paid for: their rows can't be removed (FLT-05)
const TAKEN_SEATS = [SeatAvailability.HELD, SeatAvailability.BOOKED];

const isDuplicateKeyError = (error: unknown) => (error as { code?: number } | null)?.code === 11000;
const existingRanges = (cabins: Cabin[]) => cabins.map(rowRangeOf).filter((range): range is RowRange => range !== null);
const flightChangedError = () =>
  new ConflictException(
    'The flight changed while saving (a seat was held or booked, a cabin changed, or the flight was cancelled). Reload it and try again.',
  );

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
    assertSchedule(departureAt, arrivalAt);

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
   * FLT-05: change departure/arrival times (and airports, until the first seat is held or booked).
   * Same conversion and checks as on creation; a side whose local time isn't sent keeps its stored UTC time.
   */
  async update(flightId: string, moderatorId: string, dto: UpdateFlightDto): Promise<FlightResponseDto> {
    if (Object.values(dto).every((value) => value === undefined)) {
      throw new BadRequestException('Send at least one of departureAirportId, departureLocalTime, arrivalAirportId or arrivalLocalTime.');
    }
    const flight = await this.findEditableFlight(flightId, moderatorId);

    const departureAirportId = dto.departureAirportId ?? flight.departure.airportId.toString();
    const arrivalAirportId = dto.arrivalAirportId ?? flight.arrival.airportId.toString();
    const departureAirportChanged = departureAirportId !== flight.departure.airportId.toString();
    const arrivalAirportChanged = arrivalAirportId !== flight.arrival.airportId.toString();
    const airportsChanged = departureAirportChanged || arrivalAirportChanged;

    if (departureAirportId === arrivalAirportId) {
      throw new BadRequestException('Departure and arrival airports must be different.');
    }
    // A local time only means something together with its airport
    if (departureAirportChanged && !dto.departureLocalTime) {
      throw new BadRequestException('Send departureLocalTime when changing the departure airport.');
    }
    if (arrivalAirportChanged && !dto.arrivalLocalTime) {
      throw new BadRequestException('Send arrivalLocalTime when changing the arrival airport.');
    }
    if (airportsChanged && hasTakenSeat(flight)) {
      throw new ConflictException("Airports can't change once a seat on this flight is held or booked.");
    }

    const zones = await this.airportTimeZones(departureAirportId, arrivalAirportId);
    const departureAt = dto.departureLocalTime
      ? localToUtc(dto.departureLocalTime, zones.departure, 'Departure time')
      : flight.departure.timestamp;
    const arrivalAt = dto.arrivalLocalTime
      ? localToUtc(dto.arrivalLocalTime, zones.arrival, 'Arrival time')
      : flight.arrival.timestamp;
    assertSchedule(departureAt, arrivalAt);

    await this.assertNumberFreeOnLocalDate(flight.airlineId, flight.number, departureAt, zones.departure, flight._id);

    let updated: FlightRecord | null;
    try {
      updated = await this.flightModel
        .findOneAndUpdate(
          {
            ...editableFilter(flight._id),
            // Atomic with the write: still no held/booked seat if the airports change
            ...(airportsChanged ? { cabins: { $not: { $elemMatch: { 'seats.availability': { $in: TAKEN_SEATS } } } } } : {}),
          },
          {
            $set: {
              departure: { airportId: new Types.ObjectId(departureAirportId), timestamp: departureAt },
              arrival: { airportId: new Types.ObjectId(arrivalAirportId), timestamp: arrivalAt },
            },
          },
          { returnDocument: 'after', runValidators: true },
        )
        .lean<FlightRecord>()
        .exec();
    } catch (error) {
      if (isDuplicateKeyError(error)) throw this.duplicateNumberError(flight.number, departureAt, zones.departure);
      throw error;
    }
    if (!updated) throw flightChangedError();

    // TODO(FLT-05): if a time changed, send an in-app notification to passengers with Confirmed bookings
    // (GEN-01/NEW-02; notifications are not built yet).

    return toFlightResponse(updated, zones.departure, zones.arrival);
  }

  /**
   * FLT-06: cancel a Scheduled flight. In one atomic update the status becomes cancelled (so search hides it) and
   * every held seat goes back to available. Booked seats stay booked, as a record of the cancelled bookings.
   */
  async cancel(flightId: string, moderatorId: string): Promise<FlightResponseDto> {
    const flight = await this.findEditableFlight(flightId, moderatorId);

    const cancelled = await this.flightModel
      .findOneAndUpdate(
        editableFilter(flight._id),
        {
          $set: {
            status: FlightStatus.CANCELLED,
            // $[] = every cabin, $[held] = only the seats matched by the array filter below
            'cabins.$[].seats.$[held].availability': SeatAvailability.AVAILABLE,
          },
        },
        { returnDocument: 'after', arrayFilters: [{ 'held.availability': SeatAvailability.HELD }] },
      )
      .lean<FlightRecord>()
      .exec();
    if (!cancelled) throw flightChangedError();

    // TODO(FLT-06): when the FlightBooking schema is ready, in the same flow:
    //  - set this flight's Confirmed bookings to Cancelled with a 100% refund (PAY-03),
    //  - expire its Pending Payment bookings (their seat holds were released above),
    //  - send passengers an in-app notification (GEN-01/NEW-02).

    return this.toResponse(cancelled);
  }

  // FLT-04: add a cabin type the flight doesn't have yet (same seat generation and row rules as on creation)
  async addCabin(flightId: string, moderatorId: string, dto: CreateCabinDto): Promise<FlightResponseDto> {
    const flight = await this.findEditableFlight(flightId, moderatorId);
    if (flight.cabins.some((cabin) => cabin.name === dto.name)) {
      throw new ConflictException(`This flight already has a ${dto.name} cabin.`);
    }
    const [cabin] = buildCabins([dto], flight.maxBagWeight);
    assertNoRowOverlap([...existingRanges(flight.cabins), dto]);

    const updated = await this.flightModel
      .findOneAndUpdate(
        {
          ...editableFilter(flight._id),
          // The same two checks again inside the write, in case the flight changed after it was read
          $and: [
            { 'cabins.name': { $ne: dto.name } },
            { cabins: { $not: { $elemMatch: { seats: { $elemMatch: { row: { $gte: dto.firstRow, $lte: dto.lastRow } } } } } } },
          ],
        },
        { $push: { cabins: cabin } },
        { returnDocument: 'after', runValidators: true },
      )
      .lean<FlightRecord>()
      .exec();
    if (!updated) throw flightChangedError();

    return this.toResponse(updated);
  }

  /**
   * FLT-05: change a cabin's seat price and/or row range. Added rows reuse the cabin's seat layout; rows can only be
   * removed if none of their seats is held or booked. Bookings keep the price they were made at, so a new price only
   * affects later bookings.
   */
  async updateCabin(
    flightId: string,
    cabinName: string,
    moderatorId: string,
    dto: UpdateCabinDto,
  ): Promise<FlightResponseDto> {
    if (dto.seatPrice === undefined && dto.firstRow === undefined && dto.lastRow === undefined) {
      throw new BadRequestException('Send at least one of seatPrice, firstRow or lastRow.');
    }
    const flight = await this.findEditableFlight(flightId, moderatorId);
    const cabin = flight.cabins.find((candidate) => candidate.name === cabinName);
    if (!cabin) throw new NotFoundException(`This flight has no "${cabinName}" cabin.`);
    const current = rowRangeOf(cabin);
    if (!current) throw new BadRequestException(`${cabin.name} has no seats, so it can't be edited here.`);

    const firstRow = dto.firstRow ?? current.firstRow;
    const lastRow = dto.lastRow ?? current.lastRow;
    assertRowOrder(cabin.name, firstRow, lastRow);
    const otherCabins = flight.cabins.filter((other) => other.name !== cabin.name);
    assertNoRowOverlap([...existingRanges(otherCabins), { name: cabin.name, firstRow, lastRow }]);

    const outsideRange = (seat: Seat) => seat.row < firstRow || seat.row > lastRow;
    const taken = cabin.seats.filter((seat) => outsideRange(seat) && TAKEN_SEATS.includes(seat.availability));
    if (taken.length) {
      const labels = taken.slice(0, 10).map((seat) => `${seat.row}${seat.column}`);
      throw new ConflictException(
        `Can't remove those rows: ${taken.length} seat(s) are held or booked (${labels.join(', ')}${taken.length > 10 ? ', ...' : ''}).`,
      );
    }

    const existingRows = new Set(cabin.seats.map((seat) => seat.row));
    const newRows = rowsBetween(firstRow, lastRow).filter((row) => !existingRows.has(row));
    const addedSeats = seatsForRows(newRows, layoutOf(cabin));

    const updated = await this.flightModel
      .findOneAndUpdate(
        {
          ...editableFilter(flight._id),
          $and: [
            // Atomic with the write: no seat in the rows being removed was held or booked after we read the flight
            {
              cabins: {
                $elemMatch: {
                  name: cabin.name,
                  seats: {
                    $not: {
                      $elemMatch: {
                        availability: { $in: TAKEN_SEATS },
                        $or: [{ row: { $lt: firstRow } }, { row: { $gt: lastRow } }],
                      },
                    },
                  },
                },
              },
            },
            // ...and no other cabin took any of the new rows
            {
              cabins: {
                $not: {
                  $elemMatch: { name: { $ne: cabin.name }, seats: { $elemMatch: { row: { $gte: firstRow, $lte: lastRow } } } },
                },
              },
            },
          ],
        },
        [resizeCabinStage(cabin.name, firstRow, lastRow, addedSeats, dto.seatPrice ?? cabin.seatPrice)],
        { returnDocument: 'after', updatePipeline: true },
      )
      .lean<FlightRecord>()
      .exec();
    if (!updated) throw flightChangedError();

    return this.toResponse(updated);
  }

  /**
   * FLT-04/05/06: the flight exists (404), belongs to the moderator's airline (403/404, checked before revealing its
   * state), is Scheduled and hasn't departed yet (409).
   */
  private async findEditableFlight(flightId: string, moderatorId: string): Promise<FlightRecord> {
    if (!isValidObjectId(flightId)) throw new NotFoundException(FLIGHT_NOT_FOUND);
    const flight = await this.flightModel.findById(flightId).lean<FlightRecord>().exec();
    if (!flight) throw new NotFoundException(FLIGHT_NOT_FOUND);

    await this.airlinesService.findOwnedAirline(flight.airlineId.toString(), moderatorId);

    if (flight.status !== FlightStatus.SCHEDULED) {
      throw new ConflictException(`Only scheduled flights can be edited; this flight is ${flight.status}.`);
    }
    if (flight.departure.timestamp <= new Date()) {
      throw new ConflictException('This flight has already departed, so it can no longer be edited.');
    }
    return flight;
  }

  private async toResponse(flight: FlightRecord): Promise<FlightResponseDto> {
    const zones = await this.airportTimeZones(flight.departure.airportId.toString(), flight.arrival.airportId.toString());
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
  // When editing (FLT-05), the flight being edited is excluded so it doesn't clash with itself.
  private async assertNumberFreeOnLocalDate(
    airlineId: Types.ObjectId,
    number: string,
    departureAt: Date,
    timeZone: string,
    excludeFlightId?: Types.ObjectId,
  ) {
    const { start, end } = localDayBoundsUtc(departureAt, timeZone);
    const taken = await this.flightModel
      .exists({
        ...(excludeFlightId ? { _id: { $ne: excludeFlightId } } : {}),
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

// FLT-03/FLT-05: arrival strictly after departure (both UTC), and departure still in the future
function assertSchedule(departureAt: Date, arrivalAt: Date): void {
  if (arrivalAt <= departureAt) {
    throw new BadRequestException('Arrival must be after departure (compared in UTC).');
  }
  if (departureAt <= new Date()) {
    throw new BadRequestException('Departure must be in the future.');
  }
}

// FLT-05: true once any seat in any cabin is held or booked
function hasTakenSeat(flight: FlightRecord): boolean {
  return flight.cabins.some((cabin) => cabin.seats.some((seat) => TAKEN_SEATS.includes(seat.availability)));
}

// Only a Scheduled flight that hasn't departed can be changed (FLT-05, FLT-30)
function editableFilter(flightId: Types.ObjectId) {
  return { _id: flightId, status: FlightStatus.SCHEDULED, 'departure.timestamp': { $gt: new Date() } };
}

/**
 * FLT-05 as one atomic update stage: in the named cabin keep the seats inside firstRow..lastRow (with their current
 * availability, so a seat held meanwhile stays held), append the seats of the new rows and set the price.
 * Other cabins are left as they are.
 */
export function resizeCabinStage(name: string, firstRow: number, lastRow: number, addedSeats: Seat[], seatPrice: number) {
  const keptSeats = {
    $filter: {
      input: '$$cabin.seats',
      as: 'seat',
      cond: { $and: [{ $gte: ['$$seat.row', firstRow] }, { $lte: ['$$seat.row', lastRow] }] },
    },
  };
  return {
    $set: {
      cabins: {
        $map: {
          input: '$cabins',
          as: 'cabin',
          in: {
            // $cond: [if this is the cabin, the updated cabin, otherwise unchanged]
            $cond: [
              { $eq: ['$$cabin.name', name] },
              {
                $mergeObjects: [
                  '$$cabin',
                  { seatPrice: { $literal: seatPrice }, seats: { $concatArrays: [keptSeats, { $literal: addedSeats }] } },
                ],
              },
              '$$cabin',
            ],
          },
        },
      },
    },
  };
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
