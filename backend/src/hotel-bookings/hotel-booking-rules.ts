import { BadRequestException } from '@nestjs/common';
import { DateTime } from 'luxon';
import { ADULT_AGE, MAX_NIGHTS } from './hotel-booking.constants.js';

// Pure booking rules (HTL-16, HTL-18): no database access, so they are unit-tested directly.

export type Stay = { startDate: Date; endDate: Date; nights: number };
export type RoomGuests = { roomId: string; adults: number; childAges?: number[] };
/** A stay as [start, end) dates at UTC midnight. */
export type DateRange = { startDate: Date; endDate: Date };

/** A calendar date "YYYY-MM-DD" as UTC midnight; rejects dates that don't exist (e.g. 2026-02-30). */
export function parseDateOnly(value: string, field: string): Date {
  const parsed = DateTime.fromISO(value, { zone: 'utc' });
  if (!parsed.isValid || parsed.toISODate() !== value) throw new BadRequestException(`${field} "${value}" is not a valid date.`);
  return parsed.toJSDate();
}

/**
 * HTL-18: check-out must be after check-in, and check-in can't be before `today` (the hotel's local date).
 * Nights = whole days between the two dates.
 */
export function parseStay(checkIn: string, checkOut: string, today: string): Stay {
  const startDate = parseDateOnly(checkIn, 'checkIn');
  const endDate = parseDateOnly(checkOut, 'checkOut');
  if (endDate <= startDate) throw new BadRequestException('checkOut must be after checkIn.');
  if (checkIn < today) throw new BadRequestException(`checkIn can't be in the past (today at the hotel is ${today}).`);
  const nights = Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000);
  if (nights > MAX_NIGHTS) throw new BadRequestException(`A stay can be at most ${MAX_NIGHTS} nights.`);
  return { startDate, endDate, nights };
}

/** HTL-16: each room once, at least one guest per room, and at least one adult in the booking. */
export function assertGuests(rooms: RoomGuests[]): void {
  const seen = new Set<string>();
  rooms.forEach((room, index) => {
    if (seen.has(room.roomId)) throw new BadRequestException(`Room ${room.roomId} is selected more than once.`);
    seen.add(room.roomId);
    if (room.adults + (room.childAges?.length ?? 0) === 0) throw new BadRequestException(`Room ${index + 1} has no guests.`);
  });
  if (rooms.every((room) => room.adults === 0)) throw new BadRequestException('A booking needs at least one adult.');
}

/** HTL-16: no room's guests may exceed its maximum occupancy. */
export function assertOccupancy(guests: RoomGuests, room: { number: number; maxOccupancy: number }): void {
  const count = guests.adults + (guests.childAges?.length ?? 0);
  if (count > room.maxOccupancy) {
    throw new BadRequestException(`Room ${room.number} sleeps at most ${room.maxOccupancy}, but ${count} guests were assigned to it.`);
  }
}

/** HTL-16: stored ages of a room's guests; adults are stored as ADULT_AGE since only children's ages are asked for. */
export function guestAges(guests: RoomGuests): number[] {
  return [...Array.from({ length: guests.adults }, () => ADULT_AGE), ...(guests.childAges ?? [])];
}

/** HTL-16: total = sum over rooms of nights x that room's price per night (integer cents). */
export function stayTotal(pricesPerNight: number[], nights: number): number {
  return pricesPerNight.reduce((sum, price) => sum + price * nights, 0);
}

/** A booking's [check-in, check-out) range. */
export function bookingRange(booking: { startDate: Date; nightsCount: number }): DateRange {
  const startDate = new Date(booking.startDate);
  startDate.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(startDate);
  endDate.setUTCDate(endDate.getUTCDate() + booking.nightsCount);
  return { startDate, endDate };
}

/** Two [start, end) ranges overlap when each starts before the other ends (back-to-back stays don't overlap). */
export function rangesOverlap(a: DateRange, b: DateRange): boolean {
  return a.startDate < b.endDate && a.endDate > b.startDate;
}
