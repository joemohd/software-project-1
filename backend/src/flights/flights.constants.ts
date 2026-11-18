// Every list endpoint returns pages of this size (AGENTS.md: "Lists are paginated, page size 10")
export const PAGE_SIZE = 10;

// Longest free-text search accepted on list endpoints
export const SEARCH_MAX_LENGTH = 100;

// Upper bound on cancellation tiers per airline, so one request can't store an unbounded array (FLT-09)
export const MAX_CANCELLATION_TIERS = 20;
