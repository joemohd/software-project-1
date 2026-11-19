import { BadRequestException } from '@nestjs/common';
import { Cabin, Seat, SeatAvailability, SeatType } from '../database/schemas/flight.schema.js';
import { CreateCabinDto } from './dto/create-flight.dto.js';
import { MAX_SEATS_PER_ROW, SEAT_LAYOUT_PATTERN } from './flights.constants.js';

export type SeatColumn = { column: string; type: SeatType };

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

/** Every seat of rows firstRow..lastRow (inclusive) for a layout, all available. */
export function generateSeats(firstRow: number, lastRow: number, layout: string): Seat[] {
  const columns = parseLayout(layout);
  const seats: Seat[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (const { column, type } of columns) {
      seats.push({ row, column, type, availability: SeatAvailability.AVAILABLE });
    }
  }
  return seats;
}

/**
 * FLT-04: validates the requested cabins against each other and the flight, then generates their seats.
 * Each cabin type at most once, valid row ranges that don't overlap between cabins (so a seat like 12A is unique
 * on the flight), and a free allowance no heavier than the flight's max bag weight.
 */
export function buildCabins(cabins: CreateCabinDto[], maxBagWeight: number): Cabin[] {
  const names = cabins.map((cabin) => cabin.name);
  const repeated = names.filter((name, index) => names.indexOf(name) !== index);
  if (repeated.length) {
    throw new BadRequestException(`Each cabin type can be used once per flight; repeated: ${[...new Set(repeated)].join(', ')}.`);
  }

  for (const cabin of cabins) {
    if (cabin.firstRow > cabin.lastRow) {
      throw new BadRequestException(`${cabin.name}: firstRow (${cabin.firstRow}) can't be after lastRow (${cabin.lastRow}).`);
    }
    if (cabin.freeBagWeight > maxBagWeight) {
      throw new BadRequestException(
        `${cabin.name}: freeBagWeight (${cabin.freeBagWeight} kg) can't exceed the flight's maxBagWeight (${maxBagWeight} kg).`,
      );
    }
  }

  const byRow = [...cabins].sort((a, b) => a.firstRow - b.firstRow);
  for (let i = 1; i < byRow.length; i += 1) {
    const before = byRow[i - 1];
    const current = byRow[i];
    if (current.firstRow <= before.lastRow) {
      throw new BadRequestException(
        `${current.name} rows ${current.firstRow}-${current.lastRow} overlap ${before.name} rows ${before.firstRow}-${before.lastRow}.`,
      );
    }
  }

  return cabins.map((cabin) => ({
    name: cabin.name,
    seatPrice: cabin.seatPrice,
    freeBagWeight: cabin.freeBagWeight,
    seats: generateSeats(cabin.firstRow, cabin.lastRow, cabin.layout),
  }));
}
