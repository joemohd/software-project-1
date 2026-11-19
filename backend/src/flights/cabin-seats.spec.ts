import { BadRequestException } from '@nestjs/common';
import { CabinType, SeatAvailability } from '../database/schemas/flight.schema.js';
import { buildCabins, generateSeats, parseLayout } from './cabin-seats.js';
import { CreateCabinDto } from './dto/create-flight.dto.js';

const typesOf = (layout: string) => parseLayout(layout).map(({ column, type }) => `${column}:${type}`);

describe('parseLayout (FLT-04)', () => {
  it('marks outer seats as window, seats beside the aisle as aisle, the rest middle', () => {
    expect(typesOf('ABC-DEF')).toEqual([
      'A:window', 'B:middle', 'C:aisle',
      'D:aisle', 'E:middle', 'F:window',
    ]);
  });

  it('handles two aisles (3-4-3 style)', () => {
    expect(typesOf('ABC-DEFG-HJK')).toEqual([
      'A:window', 'B:middle', 'C:aisle',
      'D:aisle', 'E:middle', 'F:middle', 'G:aisle',
      'H:aisle', 'J:middle', 'K:window',
    ]);
  });

  it('keeps single-seat window groups as window (1-2-1 business)', () => {
    expect(typesOf('A-DF-K')).toEqual(['A:window', 'D:aisle', 'F:aisle', 'K:window']);
  });

  it.each(['ABA-DEF', 'abc-def', 'ABC--DEF', '-ABC', 'ABCDEFG-HJKLMN'])('rejects "%s"', (layout) => {
    expect(() => parseLayout(layout)).toThrow(BadRequestException);
  });
});

describe('generateSeats (FLT-04)', () => {
  it('creates rows x letters seats, all available, row by row', () => {
    const seats = generateSeats(10, 12, 'AB-CD');

    expect(seats).toHaveLength(12);
    expect(seats.every((seat) => seat.availability === SeatAvailability.AVAILABLE)).toBe(true);
    expect(seats.slice(0, 5).map((seat) => `${seat.row}${seat.column}`)).toEqual(['10A', '10B', '10C', '10D', '11A']);
    expect(seats.at(-1)).toMatchObject({ row: 12, column: 'D', type: 'window' });
  });
});

describe('buildCabins (FLT-04)', () => {
  const cabin = (overrides: Partial<CreateCabinDto> = {}): CreateCabinDto => ({
    name: CabinType.ECONOMY,
    seatPrice: 45000,
    freeBagWeight: 23,
    firstRow: 10,
    lastRow: 35,
    layout: 'ABC-DEF',
    ...overrides,
  });

  it('generates each cabin with its own seats', () => {
    const [business, economy] = buildCabins(
      [cabin({ name: CabinType.BUSINESS, firstRow: 1, lastRow: 4, layout: 'A-DF-K', seatPrice: 150000 }), cabin()],
      32,
    );

    expect(business).toMatchObject({ name: 'Business', seatPrice: 150000, freeBagWeight: 23 });
    expect(business.seats).toHaveLength(16);
    expect(economy.seats).toHaveLength(26 * 6);
  });

  it('rejects a cabin type used twice', () => {
    expect(() => buildCabins([cabin({ firstRow: 1, lastRow: 5 }), cabin()], 32)).toThrow(/Economy/);
  });

  it('rejects overlapping row ranges between cabins', () => {
    expect(() =>
      buildCabins([cabin({ name: CabinType.BUSINESS, firstRow: 1, lastRow: 10 }), cabin({ firstRow: 10 })], 32),
    ).toThrow(/overlap/);
  });

  it('rejects firstRow after lastRow', () => {
    expect(() => buildCabins([cabin({ firstRow: 20, lastRow: 19 })], 32)).toThrow(BadRequestException);
  });

  it("rejects a free allowance heavier than the flight's max bag weight", () => {
    expect(() => buildCabins([cabin({ freeBagWeight: 40 })], 32)).toThrow(/maxBagWeight/);
  });
});
