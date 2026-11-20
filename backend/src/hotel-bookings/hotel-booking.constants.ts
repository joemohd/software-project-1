// HTL-18: the selected rooms are held for 10 minutes while the user pays
export const HOTEL_HOLD_MINUTES = 10;

// HTL-18: how often overdue holds are expired in the background (they are also expired lazily before booking)
export const HOTEL_HOLD_SWEEP_INTERVAL_MS = 60_000;

// Overdue bookings handled per expiry run, so one run stays short
export const HOTEL_HOLD_SWEEP_BATCH_SIZE = 100;

// HTL-16: children are 0-17; adults are stored with this age in RoomBooking.guestAges (only children's ages are asked for)
export const CHILD_MAX_AGE = 17;
export const ADULT_AGE = 18;

// Upper bounds on one request, so a body can't be unbounded
export const MAX_ROOMS_PER_BOOKING = 10;
export const MAX_GUESTS_PER_ROOM = 20;
export const MAX_NIGHTS = 90;

// Check-in and check-out are calendar dates, e.g. "2026-12-01"
export const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
