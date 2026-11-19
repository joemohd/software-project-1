import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Airport } from '../database/schemas/airport.schema.js';
import { City } from '../database/schemas/city.schema.js';
import { FlightBooking } from '../database/schemas/expense.schema.js';
import { Flight, SeatAvailability } from '../database/schemas/flight.schema.js';
import { Airline } from '../database/schemas/provider.schema.js';
import { AirlinesService } from './airlines.service.js';
import { FlightBookingsQueryDto, FlightBookingsReportDto } from './dto/flight-bookings-report.dto.js';
import { utcToLocal } from './flight-time.js';
import { PAGE_SIZE } from './flights.constants.js';
import {
  MANIFEST_CSV_HEADER,
  MANIFEST_STATUSES,
  ManifestBooking,
  manifestEntry,
  manifestFilename,
  manifestRows,
  toCsv,
} from './passenger-manifest.js';

type FlightRecord = Flight & { _id: Types.ObjectId };

// Only these booking fields are read, so passport numbers never leave the database here (FLT-29)
const MANIFEST_FIELDS = 'reference status segments.flightId segments.cabinName segments.seats passengers.fullName passengers.type passengers.extraBagWeights';

/** FLT-29: a moderator's view of who is booked on one of their airline's flights. */
@Injectable()
export class FlightManifestService {
  constructor(
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(FlightBooking.name) private readonly bookingModel: Model<FlightBooking>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<Airline>,
    @InjectModel(Airport.name) private readonly airportModel: Model<Airport>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    private readonly airlinesService: AirlinesService,
  ) {}

  /** Confirmed and Cancelled bookings on the flight, 10 per page, newest first, plus seats remaining per cabin. */
  async listBookings(flightId: string, moderatorId: string, query: FlightBookingsQueryDto): Promise<FlightBookingsReportDto> {
    const flight = await this.findOwnedFlight(flightId, moderatorId);
    const page = query.page ?? 1;
    const filter = { 'segments.flightId': flight._id, status: { $in: MANIFEST_STATUSES } };

    const [bookings, total] = await Promise.all([
      this.bookingModel
        .find(filter)
        .select(MANIFEST_FIELDS)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean<ManifestBooking[]>()
        .exec(),
      this.bookingModel.countDocuments(filter).exec(),
    ]);

    return {
      flightId: flight._id.toString(),
      cabins: flight.cabins.map((cabin) => ({
        name: cabin.name,
        seatCount: cabin.seats.length,
        availableSeats: cabin.seats.filter((seat) => seat.availability === SeatAvailability.AVAILABLE).length,
      })),
      items: bookings.map((booking) => manifestEntry(booking, flight._id)),
      page,
      pageSize: PAGE_SIZE,
      total,
    };
  }

  /** The same passengers as CSV, all of them (oldest booking first), without passport numbers. */
  async exportPassengers(flightId: string, moderatorId: string): Promise<{ filename: string; csv: string }> {
    const flight = await this.findOwnedFlight(flightId, moderatorId);
    const bookings = await this.bookingModel
      .find({ 'segments.flightId': flight._id, status: { $in: MANIFEST_STATUSES } })
      .select(MANIFEST_FIELDS)
      .sort({ createdAt: 1, _id: 1 })
      .lean<ManifestBooking[]>()
      .exec();

    const csv = toCsv(MANIFEST_CSV_HEADER, manifestRows(bookings.map((booking) => manifestEntry(booking, flight._id))));
    const airline = await this.airlineModel.findById(flight.airlineId).select('iataCode').lean<{ iataCode: string }>().exec();
    const localDate = utcToLocal(flight.departure.timestamp, await this.departureZone(flight)).slice(0, 10);
    return { filename: manifestFilename(airline?.iataCode ?? '', flight.number, localDate), csv };
  }

  /** 404 if the flight doesn't exist, 403 if it belongs to another moderator's airline. */
  private async findOwnedFlight(flightId: string, moderatorId: string): Promise<FlightRecord> {
    if (!isValidObjectId(flightId)) throw new NotFoundException('Flight not found.');
    const flight = await this.flightModel.findById(flightId).lean<FlightRecord>().exec();
    if (!flight) throw new NotFoundException('Flight not found.');
    await this.airlinesService.findOwnedAirline(flight.airlineId.toString(), moderatorId);
    return flight;
  }

  private async departureZone(flight: FlightRecord): Promise<string> {
    const airport = await this.airportModel.findById(flight.departure.airportId).select('cityId').lean<{ cityId: Types.ObjectId }>().exec();
    const city = airport
      ? await this.cityModel.findById(airport.cityId).select('timeZone').lean<{ timeZone?: string }>().exec()
      : null;
    return city?.timeZone ?? 'UTC';
  }
}
