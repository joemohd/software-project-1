import { Types } from 'mongoose';
import { BookingStatus, FlightPassenger, FlightSegment, PassengerType } from '../database/schemas/expense.schema.js';
import { CabinType } from '../database/schemas/flight.schema.js';

// FLT-29: pure helpers for a flight's passenger list and its CSV export (no database access, unit-tested directly)

// Bookings a moderator sees for a flight: paid (Confirmed) and Cancelled. Pending Payment and Expired never flew.
export const MANIFEST_STATUSES = [BookingStatus.CONFIRMED, BookingStatus.CANCELLED];

/** The parts of a stored booking the manifest needs. Passport numbers are deliberately not part of it. */
export type ManifestBooking = {
  _id: Types.ObjectId;
  reference: string;
  status: BookingStatus;
  segments: Pick<FlightSegment, 'flightId' | 'cabinName' | 'seats'>[];
  passengers: Pick<FlightPassenger, 'fullName' | 'type' | 'extraBagWeights'>[];
};

export type ManifestPassenger = {
  fullName: string;
  type: PassengerType;
  seat: string | null; // null for infants (no seat)
  extraBagWeights: number[];
};

export type ManifestEntry = {
  id: string;
  reference: string;
  status: BookingStatus;
  cabinName: CabinType;
  passengers: ManifestPassenger[];
};

/** One booking as seen from one of its flights: that flight's cabin and each passenger's seat on it. */
export function manifestEntry(booking: ManifestBooking, flightId: Types.ObjectId): ManifestEntry {
  const segment = booking.segments.find((candidate) => candidate.flightId.equals(flightId));
  const seatOf = (index: number) => {
    const seat = segment?.seats.find((candidate) => candidate.passengerIndex === index);
    return seat ? `${seat.row}${seat.column}` : null;
  };
  return {
    id: booking._id.toString(),
    reference: booking.reference,
    status: booking.status,
    cabinName: segment?.cabinName ?? CabinType.ECONOMY,
    passengers: booking.passengers.map((passenger, index) => ({
      fullName: passenger.fullName,
      type: passenger.type,
      seat: seatOf(index),
      extraBagWeights: passenger.extraBagWeights ?? [],
    })),
  };
}

export const MANIFEST_CSV_HEADER = ['Reference', 'Passenger name', 'Type', 'Cabin', 'Seat', 'Extra bags', 'Status'];

/** One CSV row per passenger, in booking order. Extra bags = number of extra bags. */
export function manifestRows(entries: ManifestEntry[]): string[][] {
  return entries.flatMap((entry) =>
    entry.passengers.map((passenger) => [
      entry.reference,
      passenger.fullName,
      passenger.type,
      entry.cabinName,
      passenger.seat ?? '',
      String(passenger.extraBagWeights.length),
      entry.status,
    ]),
  );
}

/**
 * CSV/formula injection: a spreadsheet runs a cell that starts with = + - @ (or a tab/carriage return, which some
 * apps skip before reading the formula). Prefixing a single quote makes it plain text.
 */
export function neutraliseCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

/** RFC 4180: quote a cell containing a comma, quote or line break, doubling inner quotes. */
export function csvCell(value: string): string {
  const safe = neutraliseCell(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** Header + rows, CRLF line endings, with a UTF-8 byte-order mark so Excel shows non-ASCII names correctly. */
export function toCsv(header: string[], rows: string[][]): string {
  return '﻿' + [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** e.g. "MS123-2026-12-20-passengers.csv" (departure date local to the departure airport). */
export function manifestFilename(airlineCode: string, flightNumber: string, localDepartureDate: string): string {
  return `${airlineCode}${flightNumber}-${localDepartureDate}-passengers.csv`.replace(/[^A-Za-z0-9.-]/g, '');
}
