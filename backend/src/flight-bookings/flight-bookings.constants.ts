// FLT-19/FLT-21: seats are held for 10 minutes while the user pays
export const HOLD_MINUTES = 10;

// FLT-19/FLT-21: how often overdue holds are expired in the background (they are also expired lazily before use)
export const HOLD_SWEEP_INTERVAL_MS = 60_000;

// FLT-19/FLT-21: after losing a race for seats, try again this many times (with randomly picked seats) before giving up
export const MAX_HOLD_RETRIES = 5;

// Overdue bookings handled per expiry run, so one run stays short
export const HOLD_SWEEP_BATCH_SIZE = 100;

// FLT-19: passenger type from age at outbound departure: adult 12+, child 2-11, infant under 2
export const ADULT_MIN_AGE = 12;
export const CHILD_MIN_AGE = 2;

// FLT-19: an infant (no seat) pays this percentage of the cabin's seat price
export const INFANT_FARE_PERCENT = 10;

// Upper bounds on one request, so a body can't be unbounded
export const MAX_PASSENGERS_PER_BOOKING = 9;
export const MAX_EXTRA_BAGS_PER_PASSENGER = 10;

// FLT-23: booking references look like "K7M2QX" (no 0/O or 1/I, to avoid misreading)
export const REFERENCE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const REFERENCE_LENGTH = 6;
export const REFERENCE_ATTEMPTS = 5;

// Date of birth is a calendar date, e.g. "1990-05-31"
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Passport or national ID number: letters and digits only
export const PASSPORT_NUMBER_PATTERN = /^[A-Za-z0-9]{5,20}$/;

// FLT-27: PaymentIntent metadata.purpose of a fare difference paid for a flight change
export const FLIGHT_CHANGE_PURPOSE = 'flight_change';
