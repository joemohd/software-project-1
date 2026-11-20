import { Transform } from 'class-transformer';

/**
 * Trims surrounding spaces before validation runs, so "   " fails @IsNotEmpty() with a 400
 * instead of reaching the database. Not used on passwords (spaces there are allowed).
 */
export const Trim = () => Transform(({ value }) => (typeof value === 'string' ? value.trim() : value));
