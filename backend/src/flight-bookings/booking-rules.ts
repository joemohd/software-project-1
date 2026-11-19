import { randomInt } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { BookingStatus, PassengerType } from '../database/schemas/expense.schema.js';
import { Seat, SeatAvailability } from '../database/schemas/flight.schema.js';
import {
  ADULT_MIN_AGE,
  CHILD_MIN_AGE,
  INFANT_FARE_PERCENT,
  REFERENCE_ALPHABET,
  REFERENCE_LENGTH,
} from './flight-bookings.constants.js';

// Pure booking rules (FLT-19, FLT-22): no database access, so they are unit-tested directly.

export type SeatCoordinate = { row: number; column: string };

/** Whole years between a date of birth and another calendar date (both "YYYY-MM-DD"). */
export function ageOn(dateOfBirth: string, onDate: string): number {
  const [birthYear, birthMonthDay] = [Number(dateOfBirth.slice(0, 4)), dateOfBirth.slice(5)];
  const [year, monthDay] = [Number(onDate.slice(0, 4)), onDate.slice(5)];
  // The birthday hasn't come yet this year if its month-day is later (a 29 Feb birthday counts from 1 Mar)
  return year - birthYear - (monthDay < birthMonthDay ? 1 : 0);
}

/**
 * FLT-19: passenger type from the age on the outbound departure date (local to the departure airport).
 * Rejects impossible dates and a birth date after the departure date.
 */
export function passengerTypeOn(dateOfBirth: string, departureDate: string, label: string): PassengerType {
  const parsed = DateTime.fromISO(dateOfBirth, { zone: 'utc' });
  if (!parsed.isValid || parsed.toISODate() !== dateOfBirth) {
    throw new BadRequestException(`${label}: date of birth "${dateOfBirth}" is not a valid date.`);
  }
  if (dateOfBirth > departureDate) {
    throw new BadRequestException(`${label}: date of birth is after the outbound departure date.`);
  }
  const age = ageOn(dateOfBirth, departureDate);
  if (age >= ADULT_MIN_AGE) return PassengerType.ADULT;
  if (age >= CHILD_MIN_AGE) return PassengerType.CHILD;
  return PassengerType.INFANT;
}

/** FLT-19: at least one adult, and no more infants than adults (each infant sits on an adult's lap). */
export function assertPassengerMix(types: PassengerType[]): void {
  const adults = types.filter((type) => type === PassengerType.ADULT).length;
  const infants = types.filter((type) => type === PassengerType.INFANT).length;
  if (adults === 0) {
    throw new BadRequestException('A booking needs at least one adult (12 or older on the outbound departure date).');
  }
  if (infants > adults) {
    throw new BadRequestException(`Each infant needs an adult: ${infants} infant(s) but only ${adults} adult(s).`);
  }
}

/** Passport/ID numbers compared without case or spaces. */
export function normalizePassport(passportNumber: string): string {
  return passportNumber.replace(/\s+/g, '').toUpperCase();
}

/** FLT-19: a passport/ID number can appear only once in a booking. */
export function assertUniquePassports(passportNumbers: string[]): void {
  const seen = new Set<string>();
  for (const passport of passportNumbers.map(normalizePassport)) {
    if (seen.has(passport)) throw new BadRequestException(`Passport/ID number ${passport} is used for more than one passenger.`);
    seen.add(passport);
  }
}

/** FLT-19: an infant pays 10% of the seat price (integer cents, rounded half up). */
export function infantFare(seatPrice: number): number {
  return Math.round((seatPrice * INFANT_FARE_PERCENT) / 100);
}

/** FLT-19: one segment's fare = seat price x seated passengers + infant fare x infants (integer cents). */
export function segmentFare(seatPrice: number, seatedPassengers: number, infants: number): number {
  return seatPrice * seatedPassengers + infantFare(seatPrice) * infants;
}

/**
 * FLT-19: each passenger may add up to the airline's maximum number of extra bags, and no bag may be heavier than the
 * flight's maximum bag weight.
 */
export function assertBaggage(
  extraBagWeights: number[][],
  limits: { maxExtraBagCount: number; maxBagWeight: number },
  flightLabel: string,
): void {
  extraBagWeights.forEach((weights, index) => {
    if (weights.length > limits.maxExtraBagCount) {
      throw new BadRequestException(
        `Passenger ${index + 1}: ${weights.length} extra bag(s), but ${flightLabel} allows at most ${limits.maxExtraBagCount} per passenger.`,
      );
    }
    const tooHeavy = weights.find((weight) => weight > limits.maxBagWeight);
    if (tooHeavy !== undefined) {
      throw new BadRequestException(
        `Passenger ${index + 1}: a ${tooHeavy} kg bag is over the ${limits.maxBagWeight} kg limit on ${flightLabel}.`,
      );
    }
  });
}

/** FLT-19: extra baggage fee for one flight = price per extra bag x number of extra bags (integer cents). */
export function baggageFee(priceExtraBag: number, extraBags: number): number {
  return priceExtraBag * extraBags;
}

/**
 * FLT-22: picks `count` available seats, keeping the group in one row when a row has enough of them.
 * Returns null when the cabin doesn't have enough available seats.
 *
 * Without `random`: the lowest row with room, its first seats in letter order (or, if no row has room, the first
 * available seats by row and letter). With `random` (used when retrying after losing a race, so concurrent bookings
 * stop colliding on the same seats): a random row with room and a random run of neighbouring available seats in it
 * (or, if no row has room, random available seats).
 */
export function pickSeats(seats: Seat[], count: number, random?: (max: number) => number): SeatCoordinate[] | null {
  const available = seats
    .filter((seat) => seat.availability === SeatAvailability.AVAILABLE)
    .sort(bySeatOrder);
  if (available.length < count) return null;

  const byRow = new Map<number, Seat[]>();
  for (const seat of available) byRow.set(seat.row, [...(byRow.get(seat.row) ?? []), seat]);
  const rowsWithRoom = [...byRow.values()].filter((rowSeats) => rowSeats.length >= count);

  let picked: Seat[];
  if (!random) {
    picked = (rowsWithRoom[0] ?? available).slice(0, count);
  } else if (rowsWithRoom.length) {
    const rowSeats = rowsWithRoom[random(rowsWithRoom.length)];
    const start = random(rowSeats.length - count + 1);
    picked = rowSeats.slice(start, start + count);
  } else {
    // Partial Fisher-Yates shuffle: the first `count` entries become a random sample
    const pool = [...available];
    for (let i = 0; i < count; i += 1) {
      const j = i + random(pool.length - i);
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    picked = pool.slice(0, count).sort(bySeatOrder);
  }
  return picked.map(({ row, column }) => ({ row, column }));
}

function bySeatOrder(a: Seat, b: Seat): number {
  return a.row - b.row || a.column.localeCompare(b.column);
}

/** FLT-23: a random booking reference such as "K7M2QX"; uniqueness is enforced by the database index. */
export function generateReference(random: (max: number) => number = randomInt): string {
  return Array.from({ length: REFERENCE_LENGTH }, () => REFERENCE_ALPHABET[random(REFERENCE_ALPHABET.length)]).join('');
}

/**
 * FLT-23/FLT-25: the booking reference is only shown once the booking has been Confirmed (payment verified).
 * Completed and Cancelled bookings were confirmed first; Pending Payment and Expired ones never were.
 */
export function isReferenceVisible(status: BookingStatus): boolean {
  return [BookingStatus.CONFIRMED, BookingStatus.COMPLETED, BookingStatus.CANCELLED].includes(status);
}

/** Booking name shown in lists, e.g. "MS 123 CAI -> JFK" or "MS 123 CAI -> JFK, MS 124 JFK -> CAI". */
export function bookingName(segments: { airlineCode: string; number: string; from: string; to: string }[]): string {
  return segments.map((segment) => `${segment.airlineCode} ${segment.number} ${segment.from} -> ${segment.to}`).join(', ');
}
