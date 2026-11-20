// Limits for the itineraries module, taken from docs/functional-requirements.csv

// ITN-01: itinerary title length
export const ITINERARY_TITLE_MAX_LENGTH = 100;

// ITN-05: an itinerary has at most 60 days
export const ITINERARY_MAX_DAYS = 60;

// ITN-12, GEN-08: at most 5 images per activity
export const ACTIVITY_MAX_IMAGES = 5;

// GEN-05: every list longer than 10 rows is paginated with page size 10
export const PAGE_SIZE = 10;

// ITN-21: longest search keyword accepted
export const SEARCH_MAX_LENGTH = 100;

// ITN-18: rates are fetched at most once per day; this is the base all cached rates are stored against
export const FX_BASE_CURRENCY = 'USD';

// ITN-18: default FXRatesAPI endpoint (overridable with FXRATES_API_URL)
export const FX_DEFAULT_API_URL = 'https://api.fxratesapi.com/latest';

// ITN-18: currency used when the user has no preferred currency and none is given in the query
export const DEFAULT_DISPLAY_CURRENCY = 'USD';

// ITN-18: abort the FX API call after this many milliseconds and fall back to cached rates
export const FX_REQUEST_TIMEOUT_MS = 5000;
