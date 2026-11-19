// Every list endpoint returns pages of this size (AGENTS.md: "Lists are paginated, page size 10")
export const PAGE_SIZE = 10;

// Longest free-text search accepted on list endpoints
export const SEARCH_MAX_LENGTH = 100;

// Upper bound on cancellation tiers per airline, so one request can't store an unbounded array (FLT-09)
export const MAX_CANCELLATION_TIERS = 20;

// Seat map limits (FLT-04): rows are numbered 1..MAX_SEAT_ROW, a row has at most MAX_SEATS_PER_ROW seats
export const MAX_SEAT_ROW = 150;
export const MAX_SEATS_PER_ROW = 12;

// Seat layout: column letters per row, aisles written as "-", e.g. "ABC-DEF" or "AC-DEFG-HK"
export const SEAT_LAYOUT_PATTERN = /^[A-Z]+(-[A-Z]+)*$/;

// Heaviest bag a flight can allow, in kg
export const MAX_BAG_WEIGHT_KG = 100;

// FLT-03: flight times are entered as the airport's local wall-clock time, without an offset
export const LOCAL_TIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const LOCAL_TIME_FORMAT = "yyyy-MM-dd'T'HH:mm";
