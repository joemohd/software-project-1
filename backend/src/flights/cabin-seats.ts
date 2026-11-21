import { BadRequestException } from '@nestjs/common';
import { Cabin, CabinType, Seat, SeatAvailability, SeatType } from '../database/schemas/flight.schema.js';
import { CreateCabinDto } from './dto/create-flight.dto.js';
import { MAX_SEATS_PER_ROW, SEAT_LAYOUT_PATTERN } from './flights.constants.js';

export type SeatColumn = { column: string; type: SeatType };
export type RowRange = { name: CabinType; firstRow: number; lastRow: number };

/**
 * FLT-04: "ABC-DEF" -> one entry per seat letter with its type. Letter groups are separated by aisles ("-").
 * The first and last letters of the row are window seats, a letter next to "-" is an aisle seat, the rest are middle.
 * e.g. "ABC-DEF" -> A window, B middle, C aisle, D aisle, E middle, F window.
 */
export function parseLayout(layout: string): SeatColumn[] {
  if (!SEAT_LAYOUT_PATTERN.test(layout)) {
    throw new BadRequestException(`Seat layout "${layout}" must be letter groups separated by "-", e.g. "ABC-DEF".`);
  }
  const groups = layout.split('-');
  const letters = groups.join('');
  if (new Set(letters).size !== letters.length) {
    throw new BadRequestException(`Seat layout "${layout}" uses a seat letter more than once.`);
  }
  if (letters.length > MAX_SEATS_PER_ROW) {
    throw new BadRequestException(`Seat layout "${layout}" has more than ${MAX_SEATS_PER_ROW} seats per row.`);
  }

  const lastGroup = groups.length - 1;
  return groups.flatMap((group, g) =>
    group.split('').map((column, i) => {
      const isRowEnd = (g === 0 && i === 0) || (g === lastGroup && i === group.length - 1);
      if (isRowEnd) return { column, type: SeatType.WINDOW };
      const besideAisle = (i === 0 && g > 0) || (i === group.length - 1 && g < lastGroup);
      return { column, type: besideAisle ? SeatType.AISLE : SeatType.MIDDLE };
    }),
  );
}

/** One available seat per column for each of the given rows. */
export function seatsForRows(rows: number[], columns: SeatColumn[]): Seat[] {
  return rows.flatMap((row) =>
    columns.map(({ column, type }) => ({ row, column, type, availability: SeatAvailability.AVAILABLE })),
  );
}

/** Every seat of rows firstRow..lastRow (inclusive) for a layout, all available. */
export function generateSeats(firstRow: number, lastRow: number, layout: string): Seat[] {
  return seatsForRows(rowsBetween(firstRow, lastRow), parseLayout(layout));
}

export function rowsBetween(firstRow: number, lastRow: number): number[] {
  return Array.from({ length: lastRow - firstRow + 1 }, (_, i) => firstRow + i);
}

/** The rows an existing cabin occupies, or null if it has no seats. */
export function rowRangeOf(cabin: Cabin): RowRange | null {
  if (!cabin.seats.length) return null;
  const rows = cabin.seats.map((seat) => seat.row);
  return { name: cabin.name, firstRow: Math.min(...rows), lastRow: Math.max(...rows) };
}

/** An existing cabin's seat layout (letters and types), read from its first row. */
export function layoutOf(cabin: Cabin): SeatColumn[] {
  const range = rowRangeOf(cabin);
  if (!range) return [];
  return cabin.seats
    .filter((seat) => seat.row === range.firstRow)
    .map(({ column, type }) => ({ column, type }));
}

/** FLT-04: row ranges of different cabins must not overlap, so a seat like 12A is unique on the flight. */
export function assertNoRowOverlap(ranges: RowRange[]): void {
  const byRow = [...ranges].sort((a, b) => a.firstRow - b.firstRow);
  for (let i = 1; i < byRow.length; i += 1) {
    const before = byRow[i - 1];
    const current = byRow[i];
    if (current.firstRow <= before.lastRow) {
      throw new BadRequestException(
        `${current.name} rows ${current.firstRow}-${current.lastRow} overlap ${before.name} rows ${before.firstRow}-${before.lastRow}.`,
      );
    }
  }
}

export function assertRowOrder(name: CabinType, firstRow: number, lastRow: number): void {
  if (firstRow > lastRow) {
    throw new BadRequestException(`${name}: firstRow (${firstRow}) can't be after lastRow (${lastRow}).`);
  }
}

/**
 * FLT-04: validates the requested cabins against each other and the flight, then generates their seats.
 * Each cabin type at most once, valid row ranges that don't overlap between cabins, and a free allowance
 * no heavier than the flight's max bag weight.
 */
export function buildCabins(cabins: CreateCabinDto[], maxBagWeight: number): Cabin[] {
  const names = cabins.map((cabin) => cabin.name);
  const repeated = names.filter((name, index) => names.indexOf(name) !== index);
  if (repeated.length) {
    throw new BadRequestException(`Each cabin type can be used once per flight; repeated: ${[...new Set(repeated)].join(', ')}.`);
  }

  for (const cabin of cabins) {
    assertRowOrder(cabin.name, cabin.firstRow, cabin.lastRow);
    if (cabin.freeBagWeight > maxBagWeight) {
      throw new BadRequestException(
        `${cabin.name}: freeBagWeight (${cabin.freeBagWeight} kg) can't exceed the flight's maxBagWeight (${maxBagWeight} kg).`,
      );
    }
  }
  assertNoRowOverlap(cabins);

  return cabins.map((cabin) => {
    const seats = generateSeats(cabin.firstRow, cabin.lastRow, cabin.layout);
    if (cabin.seatCount !== undefined && cabin.seatCount !== seats.length) {
      throw new BadRequestException(
        `${cabin.name}: seatCount (${cabin.seatCount}) does not match the seats generated by rows ${cabin.firstRow}-${cabin.lastRow} and layout "${cabin.layout}" (${seats.length}).`,
      );
    }
    return {
      name: cabin.name,
      seatPrice: cabin.seatPrice,
      freeBagWeight: cabin.freeBagWeight,
      ...(cabin.freeBagCount !== undefined ? { freeBagCount: cabin.freeBagCount } : {}),
      seats,
    };
  });
}
