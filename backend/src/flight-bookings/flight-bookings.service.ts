import { randomInt } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Airport } from '../database/schemas/airport.schema.js';
import { City } from '../database/schemas/city.schema.js';
import { BookingStatus, FlightBooking, PassengerType } from '../database/schemas/expense.schema.js';
import { CabinType, Flight, FlightStatus, SeatAvailability } from '../database/schemas/flight.schema.js';
import { Airline, ProviderStatus } from '../database/schemas/provider.schema.js';
import { utcToLocal } from '../flights/flight-time.js';
import {
  assertBaggage,
  assertPassengerMix,
  assertUniquePassports,
  baggageFee,
  bookingName,
  generateReference,
  infantFare,
  normalizePassport,
  passengerTypeOn,
  pickSeats,
  SeatCoordinate,
  segmentFare,
} from './booking-rules.js';
import { CreateFlightBookingDto } from './dto/create-flight-booking.dto.js';
import { BookingAirportDto, FlightBookingResponseDto } from './dto/flight-booking-response.dto.js';
import { HOLD_MINUTES, HOLD_SWEEP_BATCH_SIZE, MAX_HOLD_RETRIES, REFERENCE_ATTEMPTS } from './flight-bookings.constants.js';

type FlightRecord = Flight & { _id: Types.ObjectId };
type AirlineRecord = {
  _id: Types.ObjectId;
  name: string;
  iataCode: string;
  status: ProviderStatus;
  bagPolicy: { priceExtraBag: number; maxExtraBagCount: number };
};
type AirportRecord = { _id: Types.ObjectId; iataCode: string; cityId: Types.ObjectId };
type CityRecord = { _id: Types.ObjectId; timeZone?: string };
type BookingRecord = FlightBooking & { _id: Types.ObjectId };

/** Everything needed to describe a booking's flights: looked up once per request. */
type BookingContext = {
  flights: Map<string, FlightRecord>;
  airlines: Map<string, AirlineRecord>;
  airports: Map<string, { iataCode: string; timeZone: string }>;
};

/** Seats held on one flight for one booking. */
type HeldSegment = { flightId: Types.ObjectId; cabinName: CabinType; seats: SeatCoordinate[] };

const isDuplicateReferenceError = (error: unknown) => {
  const mongoError = error as { code?: number; keyPattern?: Record<string, unknown> } | null;
  return mongoError?.code === 11000 && Boolean(mongoError.keyPattern?.reference);
};

// FLT-22: a flight can be booked while it is Scheduled and hasn't departed
const isOpenForBooking = (flight: FlightRecord) =>
  flight.status === FlightStatus.SCHEDULED && flight.departure.timestamp > new Date();

@Injectable()
export class FlightBookingsService {
  // Random source for seat picking on retries; a field so tests can make it predictable
  random: (max: number) => number = randomInt;

  constructor(
    @InjectModel(FlightBooking.name) private readonly bookingModel: Model<FlightBooking>,
    @InjectModel(Flight.name) private readonly flightModel: Model<Flight>,
    @InjectModel(Airline.name) private readonly airlineModel: Model<Airline>,
    @InjectModel(Airport.name) private readonly airportModel: Model<Airport>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
  ) {}

  /**
   * FLT-19, FLT-21, FLT-22: validates passengers and baggage, prices the booking, holds the seats for 10 minutes and
   * saves it as Pending Payment. Returns the booking summary shown before payment.
   */
  async create(userId: string, dto: CreateFlightBookingDto): Promise<FlightBookingResponseDto> {
    if (dto.segments.length === 2 && dto.segments[0].flightId === dto.segments[1].flightId) {
      throw new BadRequestException('The return flight must be a different flight from the outbound one.');
    }
    const flightIds = dto.segments.map((segment) => new Types.ObjectId(segment.flightId));

    // FLT-22: seats whose hold ran out go back on sale before we pick seats
    await this.expireOverdueHolds({ flightIds });

    const context = await this.loadContext(flightIds);
    const segments = dto.segments.map((segmentDto, index) => {
      const label = index === 0 ? 'the outbound flight' : 'the return flight';
      const flight = context.flights.get(segmentDto.flightId);
      if (!flight) throw new NotFoundException(`Flight ${segmentDto.flightId} not found.`);
      const airline = context.airlines.get(flight.airlineId.toString());
      if (!isOpenForBooking(flight)) {
        throw new ConflictException(`${capitalize(label)} is ${flight.status === FlightStatus.SCHEDULED ? 'departed' : flight.status}, so it can't be booked.`);
      }
      if (airline?.status !== ProviderStatus.ACTIVE) {
        throw new ConflictException(`The airline of ${label} is not active, so it can't be booked.`);
      }
      const cabin = flight.cabins.find((candidate) => candidate.name === segmentDto.cabinName);
      if (!cabin) throw new BadRequestException(`${capitalize(label)} has no ${segmentDto.cabinName} cabin.`);
      return { flight, airline, cabin, label };
    });
    const [outbound, inbound] = segments;
    if (inbound) assertReturnTrip(outbound.flight, inbound.flight);

    // FLT-19: passenger types from age on the outbound departure date, local to the departure airport
    const departureZone = this.airportOf(context, outbound.flight.departure.airportId).timeZone;
    const departureDate = utcToLocal(outbound.flight.departure.timestamp, departureZone).slice(0, 10);
    const types = dto.passengers.map((passenger, index) =>
      passengerTypeOn(passenger.dateOfBirth, departureDate, `Passenger ${index + 1}`),
    );
    assertPassengerMix(types);
    assertUniquePassports(dto.passengers.map((passenger) => passenger.passportNumber));

    // FLT-19: extra bags are checked against, and charged by, each flight they travel on
    const bags = dto.passengers.map((passenger) => passenger.extraBagWeights ?? []);
    const extraBags = bags.reduce((count, weights) => count + weights.length, 0);
    let totalBaggageFee = 0;
    for (const { flight, airline, label } of segments) {
      assertBaggage(bags, { maxExtraBagCount: airline.bagPolicy.maxExtraBagCount, maxBagWeight: flight.maxBagWeight }, label);
      totalBaggageFee += baggageFee(airline.bagPolicy.priceExtraBag, extraBags);
    }

    // Infants sit on an adult's lap: they pay 10% and get no seat
    const seatedIndexes = types.flatMap((type, index) => (type === PassengerType.INFANT ? [] : [index]));
    const infants = types.length - seatedIndexes.length;
    const fareTotal = segments.reduce((sum, { cabin }) => sum + segmentFare(cabin.seatPrice, seatedIndexes.length, infants), 0);

    // FLT-22: hold the seats segment by segment; if a later step fails, give back what was already held
    const held: HeldSegment[] = [];
    try {
      for (const { flight, cabin, label } of segments) {
        held.push({ flightId: flight._id, cabinName: cabin.name, seats: await this.holdSeats(flight, cabin.name, seatedIndexes.length, label) });
      }
    } catch (error) {
      await this.releaseHeld(held);
      throw error;
    }

    let booking: BookingRecord;
    try {
      booking = await this.saveWithUniqueReference({
        userId: new Types.ObjectId(userId),
        name: bookingName(
          segments.map(({ flight, airline }) => ({
            airlineCode: airline.iataCode,
            number: flight.number,
            from: this.airportOf(context, flight.departure.airportId).iataCode,
            to: this.airportOf(context, flight.arrival.airportId).iataCode,
          })),
        ),
        bookingType: 'flight',
        status: BookingStatus.PENDING_PAYMENT,
        segments: held.map((segment, index) => ({
          flightId: segment.flightId,
          cabinName: segment.cabinName,
          seatPrice: segments[index].cabin.seatPrice,
          // seats[k] belongs to the k-th passenger who needs a seat
          seats: segment.seats.map((seat, k) => ({ passengerIndex: seatedIndexes[k], ...seat })),
        })),
        passengers: dto.passengers.map((passenger, index) => ({
          fullName: passenger.fullName,
          dateOfBirth: new Date(`${passenger.dateOfBirth}T00:00:00.000Z`),
          type: types[index],
          passportNumber: normalizePassport(passenger.passportNumber),
          extraBagWeights: bags[index],
        })),
        fareTotal,
        baggageFee: totalBaggageFee,
        cost: fareTotal + totalBaggageFee,
        holdExpiresAt: new Date(Date.now() + HOLD_MINUTES * 60_000),
      });
    } catch (error) {
      await this.releaseHeld(held);
      throw error;
    }

    return this.toResponse(booking, context);
  }

  /**
   * FLT-22: Pending Payment bookings whose hold ran out become Expired and their seats go back to available.
   * Called before creating (for the flights involved), before listing, and by the sweep every minute.
   * The status change is a guarded update, so when several callers race only one releases the seats, and a booking
   * confirmed by payment in the meantime is left alone.
   */
  async expireOverdueHolds(scope: { flightIds?: Types.ObjectId[]; userId?: Types.ObjectId } = {}): Promise<number> {
    const overdue = { status: BookingStatus.PENDING_PAYMENT, holdExpiresAt: { $lte: new Date() } };
    const candidates = await this.bookingModel
      .find({
        ...overdue,
        ...(scope.flightIds ? { 'segments.flightId': { $in: scope.flightIds } } : {}),
        ...(scope.userId ? { userId: scope.userId } : {}),
      })
      .select('_id')
      .limit(HOLD_SWEEP_BATCH_SIZE)
      .lean<{ _id: Types.ObjectId }[]>()
      .exec();

    let expired = 0;
    for (const { _id } of candidates) {
      const booking = await this.bookingModel
        .findOneAndUpdate({ _id, ...overdue }, { $set: { status: BookingStatus.EXPIRED } }, { returnDocument: 'after' })
        .select('segments')
        .lean<Pick<BookingRecord, '_id' | 'segments'>>()
        .exec();
      if (!booking) continue; // someone else expired or confirmed it first
      await this.releaseHeld(booking.segments);
      // TODO(PAY-01): cancel the booking's Stripe PaymentIntent when payments are built
      expired += 1;
    }
    return expired;
  }

  /**
   * FLT-22: picks `count` available seats and holds them in one guarded update that only matches while those exact
   * seats are still available. If another booking took one of them first, re-reads the flight and retries (up to
   * MAX_HOLD_RETRIES times) with randomly picked seats, so concurrent bookings stop colliding; otherwise 409.
   */
  private async holdSeats(flight: FlightRecord, cabinName: CabinType, count: number, label: string): Promise<SeatCoordinate[]> {
    let current = flight;
    for (let attempt = 0; attempt <= MAX_HOLD_RETRIES; attempt += 1) {
      const cabin = current.cabins.find((candidate) => candidate.name === cabinName);
      // First try: the lowest row with room; retries: random seats
      const seats = cabin ? pickSeats(cabin.seats, count, attempt === 0 ? undefined : this.random) : null;
      if (!seats) {
        const left = cabin?.seats.filter((seat) => seat.availability === SeatAvailability.AVAILABLE).length ?? 0;
        throw new ConflictException(`Not enough seats left in ${cabinName} on ${label}: ${count} needed, ${left} available.`);
      }
      if (await this.tryHoldSeats(current._id, cabinName, seats)) return seats;

      const reread = await this.flightModel.findById(current._id).lean<FlightRecord>().exec();
      if (!reread || !isOpenForBooking(reread)) throw new ConflictException(`${capitalize(label)} is no longer open for booking.`);
      current = reread;
    }
    throw new ConflictException(`The seats on ${label} were taken by other bookings at the same time. Please try again.`);
  }

  /** One atomic update: matches only if the flight is still bookable and every chosen seat is still available. */
  private async tryHoldSeats(flightId: Types.ObjectId, cabinName: CabinType, seats: SeatCoordinate[]): Promise<boolean> {
    const updated = await this.flightModel
      .findOneAndUpdate(
        {
          _id: flightId,
          status: FlightStatus.SCHEDULED,
          'departure.timestamp': { $gt: new Date() },
          $and: seats.map(({ row, column }) => ({
            cabins: { $elemMatch: { name: cabinName, seats: { $elemMatch: { row, column, availability: SeatAvailability.AVAILABLE } } } },
          })),
        },
        { $set: { 'cabins.$[cabin].seats.$[seat].availability': SeatAvailability.HELD } },
        { arrayFilters: seatArrayFilters(cabinName, seats, SeatAvailability.AVAILABLE), projection: { _id: 1 } },
      )
      .lean()
      .exec();
    return updated !== null;
  }

  /** Gives held seats back (only seats still held, so a seat that was booked meanwhile is never touched). */
  private async releaseHeld(segments: HeldSegment[]): Promise<void> {
    for (const { flightId, cabinName, seats } of segments) {
      if (!seats.length) continue;
      await this.flightModel
        .updateOne(
          { _id: flightId },
          { $set: { 'cabins.$[cabin].seats.$[seat].availability': SeatAvailability.AVAILABLE } },
          { arrayFilters: seatArrayFilters(cabinName, seats, SeatAvailability.HELD) },
        )
        .exec();
    }
  }

  /** FLT-23: the reference is random; on the rare clash with an existing one, try a new one. */
  private async saveWithUniqueReference(data: Omit<FlightBooking, 'reference' | 'payment' | 'policiesAcceptedAt' | 'expenseType' | 'description' | 'rating'>): Promise<BookingRecord> {
    for (let attempt = 1; attempt <= REFERENCE_ATTEMPTS; attempt += 1) {
      try {
        const created = await this.bookingModel.create({ ...data, reference: generateReference() });
        return created.toObject() as BookingRecord;
      } catch (error) {
        if (!isDuplicateReferenceError(error)) throw error;
      }
    }
    throw new InternalServerErrorException('Could not generate a unique booking reference. Please try again.');
  }

  private async loadContext(flightIds: Types.ObjectId[]): Promise<BookingContext> {
    const flights = await this.flightModel.find({ _id: { $in: flightIds } }).lean<FlightRecord[]>().exec();
    const airlines = await this.airlineModel
      .find({ _id: { $in: flights.map((flight) => flight.airlineId) } })
      .select('name iataCode status bagPolicy')
      .lean<AirlineRecord[]>()
      .exec();
    const airports = await this.airportModel
      .find({ _id: { $in: flights.flatMap((flight) => [flight.departure.airportId, flight.arrival.airportId]) } })
      .select('iataCode cityId')
      .lean<AirportRecord[]>()
      .exec();
    const cities = await this.cityModel
      .find({ _id: { $in: airports.map((airport) => airport.cityId) } })
      .select('timeZone')
      .lean<CityRecord[]>()
      .exec();
    const zoneOfCity = new Map(cities.map((city) => [city._id.toString(), city.timeZone]));

    return {
      flights: new Map(flights.map((flight) => [flight._id.toString(), flight])),
      airlines: new Map(airlines.map((airline) => [airline._id.toString(), airline])),
      airports: new Map(
        airports.map((airport) => [
          airport._id.toString(),
          // Flights can only be created between airports whose city has a zone; UTC is only a safe fallback
          { iataCode: airport.iataCode, timeZone: zoneOfCity.get(airport.cityId?.toString()) ?? 'UTC' },
        ]),
      ),
    };
  }

  private airportOf(context: BookingContext, airportId: Types.ObjectId): { iataCode: string; timeZone: string } {
    return context.airports.get(airportId.toString()) ?? { iataCode: '???', timeZone: 'UTC' };
  }

  /** FLT-21: the booking summary (also used by the booking details endpoint later). */
  private toResponse(booking: BookingRecord, context: BookingContext): FlightBookingResponseDto {
    const infants = booking.passengers.filter((passenger) => passenger.type === PassengerType.INFANT).length;
    const stop = (stop: { airportId: Types.ObjectId; timestamp: Date }): BookingAirportDto => {
      const airport = this.airportOf(context, stop.airportId);
      return {
        airportId: stop.airportId.toString(),
        iataCode: airport.iataCode,
        timestamp: stop.timestamp.toISOString(),
        localTime: utcToLocal(stop.timestamp, airport.timeZone),
        timeZone: airport.timeZone,
      };
    };

    return {
      id: booking._id.toString(),
      reference: booking.reference,
      status: booking.status,
      segments: booking.segments.map((segment) => {
        const flight = context.flights.get(segment.flightId.toString());
        if (!flight) throw new NotFoundException(`Flight ${segment.flightId.toString()} of this booking no longer exists.`);
        const airline = context.airlines.get(flight.airlineId.toString());
        return {
          flightId: flight._id.toString(),
          flightNumber: `${airline?.iataCode ?? '??'} ${flight.number}`,
          airlineName: airline?.name ?? '',
          departure: stop(flight.departure),
          arrival: stop(flight.arrival),
          cabinName: segment.cabinName,
          seatPrice: segment.seatPrice,
          infantPrice: infantFare(segment.seatPrice),
          seatedPassengers: segment.seats.length,
          infants,
          fare: segmentFare(segment.seatPrice, segment.seats.length, infants),
        };
      }),
      passengers: booking.passengers.map((passenger, index) => ({
        fullName: passenger.fullName,
        dateOfBirth: passenger.dateOfBirth.toISOString().slice(0, 10),
        type: passenger.type,
        passportNumber: passenger.passportNumber,
        extraBagWeights: passenger.extraBagWeights,
        seats: booking.segments.flatMap((segment, segmentIndex) =>
          segment.seats
            .filter((seat) => seat.passengerIndex === index)
            .map((seat) => ({ segment: segmentIndex, seat: `${seat.row}${seat.column}` })),
        ),
      })),
      fareTotal: booking.fareTotal,
      baggageFee: booking.baggageFee,
      total: booking.fareTotal + booking.baggageFee,
      holdExpiresAt: booking.holdExpiresAt ? booking.holdExpiresAt.toISOString() : null,
    };
  }
}

/** FLT-19: the return flight flies the reverse route and leaves after the outbound flight lands. */
function assertReturnTrip(outbound: FlightRecord, inbound: FlightRecord): void {
  const reversed =
    inbound.departure.airportId.equals(outbound.arrival.airportId) &&
    inbound.arrival.airportId.equals(outbound.departure.airportId);
  if (!reversed) {
    throw new BadRequestException('The return flight must fly the reverse route of the outbound flight.');
  }
  if (inbound.departure.timestamp <= outbound.arrival.timestamp) {
    throw new BadRequestException('The return flight must depart after the outbound flight arrives.');
  }
}

/**
 * Array filters selecting the named cabin and, inside it, exactly the given seats in the given state.
 * The state is repeated inside each $or branch on purpose: Mongoose 9 mis-casts a filter that mixes a plain field with
 * $or (it replaces the $or branches), which MongoDB then rejects.
 */
function seatArrayFilters(cabinName: CabinType, seats: SeatCoordinate[], availability: SeatAvailability) {
  return [
    { 'cabin.name': cabinName },
    { $or: seats.map(({ row, column }) => ({ 'seat.row': row, 'seat.column': column, 'seat.availability': availability })) },
  ];
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
