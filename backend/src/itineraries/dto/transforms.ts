import { Transform } from 'class-transformer';

/** Trims strings; leaves other values for the validators to reject. */
export const TrimString = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));

/** Trims and upper-cases codes such as "usd" -> "USD" or "eg" -> "EG". */
export const UpperCode = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value));

/** Same as UpperCode, for arrays of codes. */
export const UpperCodes = () =>
  Transform(({ value }) =>
    Array.isArray(value)
      ? value.map((item) => (typeof item === 'string' ? item.trim().toUpperCase() : item))
      : value,
  );
