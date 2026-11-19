/**
 * Lifecycle of a hotel reservation.
 *
 * SHARED FILE — coordinate with the Hotel-booking creation teammate (HTL-16/17/18).
 * If they already define this enum, delete this file and import theirs.
 *
 *  - PENDING_PAYMENT : rooms held for 10 minutes while the user pays (HTL-18).
 *  - CONFIRMED       : payment verified, rooms reserved (HTL-17).
 *  - COMPLETED       : a Confirmed reservation whose check-out date has passed (HTL-23).
 *  - CANCELLED       : cancelled by the user before check-in (HTL-21) or by a provider.
 *  - EXPIRED         : the 10-minute hold elapsed without a successful payment (HTL-18).
 */
export enum HotelBookingStatus {
  PENDING_PAYMENT = 'PendingPayment',
  CONFIRMED = 'Confirmed',
  COMPLETED = 'Completed',
  CANCELLED = 'Cancelled',
  EXPIRED = 'Expired',
}

/** Statuses that occupy ("hold") room inventory for a date range. */
export const INVENTORY_BLOCKING_STATUSES: HotelBookingStatus[] = [
  HotelBookingStatus.CONFIRMED,
  HotelBookingStatus.COMPLETED,
  HotelBookingStatus.PENDING_PAYMENT, // only while the hold is still valid — see service logic
];
