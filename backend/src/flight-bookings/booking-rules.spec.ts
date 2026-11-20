import { BadRequestException } from '@nestjs/common';
import { BookingStatus, PassengerType } from '../database/schemas/expense.schema.js';
import { SeatAvailability } from '../database/schemas/flight.schema.js';
import { generateSeats } from '../flights/cabin-seats.js';
import {
  ageOn,
  assertBaggage,
  assertPassengerMix,
  assertUniquePassports,
  baggageFee,
  bookingName,
  generateReference,
  infantFare,
  isReferenceVisible,
  passengerTypeOn,
  pickSeats,
  segmentFare,
} from './booking-rules.js';
import { REFERENCE_ALPHABET, REFERENCE_LENGTH } from './flight-bookings.constants.js';

const { ADULT, CHILD, INFANT } = PassengerType;

describe('booking rules (FLT-19, FLT-21)', () => {
  describe('ageOn', () => {
    it.each([
      ['2000-06-15', '2026-06-14', 25],
      ['2000-06-15', '2026-06-15', 26],
      ['2000-06-15', '2026-12-31', 26],
      ['2024-02-29', '2026-02-28', 1], // a 29 Feb birthday counts from 1 Mar in other years
      ['2024-02-29', '2026-03-01', 2],
    ])('born %s, on %s -> %i', (dob, on, age) => {
      expect(ageOn(dob, on)).toBe(age);
    });
  });

  describe('passengerTypeOn', () => {
    const departure = '2026-12-01';

    it.each([
      ['2014-12-01', ADULT], // 12th birthday on the departure date
      ['2014-12-02', CHILD], // turns 12 the day after
      ['2024-12-01', CHILD], // exactly 2
      ['2024-12-02', INFANT],
      ['2026-12-01', INFANT], // born on the departure date
    ])('born %s -> %s', (dob, type) => {
      expect(passengerTypeOn(dob, departure, 'Passenger 1')).toBe(type);
    });

    it('rejects an impossible date', () => {
      expect(() => passengerTypeOn('2001-02-30', departure, 'Passenger 2')).toThrow(/Passenger 2.*not a valid date/);
    });

    it('rejects a birth date after the departure date', () => {
      expect(() => passengerTypeOn('2026-12-02', departure, 'Passenger 1')).toThrow(/after the outbound departure/);
    });
  });

  describe('assertPassengerMix', () => {
    it('accepts adults with children and up to one infant each', () => {
      expect(() => assertPassengerMix([ADULT, ADULT, CHILD, INFANT, INFANT])).not.toThrow();
    });

    it('needs at least one adult', () => {
      expect(() => assertPassengerMix([CHILD, CHILD])).toThrow(/at least one adult/);
    });

    it('rejects more infants than adults', () => {
      expect(() => assertPassengerMix([ADULT, INFANT, INFANT])).toThrow(/2 infant\(s\) but only 1 adult/);
    });
  });

  describe('assertUniquePassports', () => {
    it('accepts different numbers', () => {
      expect(() => assertUniquePassports(['A1234567', 'B1234567'])).not.toThrow();
    });

    it('treats case and spaces as the same number', () => {
      expect(() => assertUniquePassports(['a1234567', 'A 1234567'])).toThrow(BadRequestException);
    });
  });

  describe('pricing (integer cents)', () => {
    it('charges an infant 10% of the seat price, rounded', () => {
      expect(infantFare(45000)).toBe(4500);
      expect(infantFare(45005)).toBe(4501); // 4500.5 rounds up
      expect(infantFare(45004)).toBe(4500);
    });

    it('prices a segment as seat price x seated passengers + infant fare x infants', () => {
      expect(segmentFare(45000, 3, 0)).toBe(135000);
      expect(segmentFare(45000, 2, 1)).toBe(94500);
    });

    it('charges the extra-bag price per bag', () => {
      expect(baggageFee(5000, 3)).toBe(15000);
      expect(baggageFee(5000, 0)).toBe(0);
    });

    it('keeps results integers', () => {
      for (const price of [1, 7, 99, 12345, 99999]) {
        expect(Number.isInteger(segmentFare(price, 2, 1))).toBe(true);
      }
    });
  });

  describe('assertBaggage', () => {
    const limits = { maxExtraBagCount: 2, maxBagWeight: 32 };

    it('accepts bags within the count and weight limits', () => {
      expect(() => assertBaggage([[20, 32], [], [10]], limits, 'the outbound flight')).not.toThrow();
    });

    it('rejects more bags than the airline allows per passenger', () => {
      expect(() => assertBaggage([[], [10, 10, 10]], limits, 'the outbound flight')).toThrow(
        /Passenger 2: 3 extra bag\(s\), but the outbound flight allows at most 2/,
      );
    });

    it("rejects a bag heavier than the flight's maximum", () => {
      expect(() => assertBaggage([[33]], limits, 'the return flight')).toThrow(/33 kg bag is over the 32 kg limit on the return flight/);
    });

    it('rejects any extra bag when the airline allows none', () => {
      expect(() => assertBaggage([[5]], { maxExtraBagCount: 0, maxBagWeight: 32 }, 'the outbound flight')).toThrow(BadRequestException);
    });
  });

  describe('pickSeats', () => {
    const seats = () => generateSeats(10, 12, 'ABC-DEF'); // rows 10-12, 6 seats each

    it('takes the first seats of the lowest row with enough room', () => {
      expect(pickSeats(seats(), 3)).toEqual([
        { row: 10, column: 'A' },
        { row: 10, column: 'B' },
        { row: 10, column: 'C' },
      ]);
    });

    it('skips rows without enough available seats to keep the group together', () => {
      const cabin = seats();
      for (const seat of cabin.filter((s) => s.row === 10 && s.column !== 'F')) seat.availability = SeatAvailability.BOOKED;
      expect(pickSeats(cabin, 2)).toEqual([
        { row: 11, column: 'A' },
        { row: 11, column: 'B' },
      ]);
    });

    it('never picks held, booked or blocked seats', () => {
      const cabin = seats();
      cabin[0].availability = SeatAvailability.HELD;
      cabin[1].availability = SeatAvailability.BLOCKED;
      expect(pickSeats(cabin, 2)).toEqual([
        { row: 10, column: 'C' },
        { row: 10, column: 'D' },
      ]);
    });

    it('splits the group across rows when no row has enough seats', () => {
      const cabin = seats();
      for (const seat of cabin.filter((s) => !['A', 'B'].includes(s.column))) seat.availability = SeatAvailability.BOOKED;
      expect(pickSeats(cabin, 3)).toEqual([
        { row: 10, column: 'A' },
        { row: 10, column: 'B' },
        { row: 11, column: 'A' },
      ]);
    });

    describe('random mode (retries)', () => {
      it('picks a random row with room and a random run of neighbouring seats in it', () => {
        // rows with room: 10, 11, 12 -> index 1 = row 11; starts 0..3 -> 2 = C, D, E
        const answers = [1, 2];
        expect(pickSeats(seats(), 3, () => answers.shift() ?? 0)).toEqual([
          { row: 11, column: 'C' },
          { row: 11, column: 'D' },
          { row: 11, column: 'E' },
        ]);
      });

      it('only picks rows that can keep the group together', () => {
        const cabin = seats();
        for (const seat of cabin.filter((s) => s.row !== 12 && s.column !== 'A')) seat.availability = SeatAvailability.BOOKED;
        for (let run = 0; run < 20; run += 1) {
          const picked = pickSeats(cabin, 2, (max) => Math.floor(Math.random() * max));
          expect(picked?.every((seat) => seat.row === 12)).toBe(true);
        }
      });

      it('picks random available seats when no row has room, never unavailable ones', () => {
        const cabin = seats();
        for (const seat of cabin.filter((s) => !['A', 'F'].includes(s.column))) seat.availability = SeatAvailability.HELD;
        for (let run = 0; run < 20; run += 1) {
          const picked = pickSeats(cabin, 3, (max) => Math.floor(Math.random() * max)) ?? [];
          expect(picked).toHaveLength(3);
          expect(new Set(picked.map((s) => `${s.row}${s.column}`)).size).toBe(3);
          expect(picked.every((s) => ['A', 'F'].includes(s.column))).toBe(true);
        }
      });

      it('spreads picks over the cabin instead of always taking the first seat', () => {
        const chosen = new Set<string>();
        for (let run = 0; run < 50; run += 1) {
          const [seat] = pickSeats(seats(), 1, (max) => Math.floor(Math.random() * max)) ?? [];
          chosen.add(`${seat.row}${seat.column}`);
        }
        expect(chosen.size).toBeGreaterThan(5);
      });
    });

    it('returns null when not enough seats are available', () => {
      const cabin = seats();
      for (const seat of cabin.slice(2)) seat.availability = SeatAvailability.BOOKED;
      expect(pickSeats(cabin, 3)).toBeNull();
    });
  });

  describe('generateReference', () => {
    it('makes a 6-character code from the unambiguous alphabet', () => {
      const reference = generateReference();
      expect(reference).toHaveLength(REFERENCE_LENGTH);
      expect(reference.split('').every((char) => REFERENCE_ALPHABET.includes(char))).toBe(true);
    });

    it('uses the random source it is given', () => {
      expect(generateReference(() => 0)).toBe('AAAAAA');
    });
  });

  it.each([
    [BookingStatus.PENDING_PAYMENT, false],
    [BookingStatus.EXPIRED, false],
    [BookingStatus.CONFIRMED, true],
    [BookingStatus.COMPLETED, true],
    [BookingStatus.CANCELLED, true],
  ])('shows the reference for a %s booking: %s', (status, visible) => {
    expect(isReferenceVisible(status)).toBe(visible);
  });

  it('names a booking after its flights', () => {
    expect(bookingName([{ airlineCode: 'MS', number: '123', from: 'CAI', to: 'JFK' }])).toBe('MS 123 CAI -> JFK');
    expect(
      bookingName([
        { airlineCode: 'MS', number: '123', from: 'CAI', to: 'JFK' },
        { airlineCode: 'MS', number: '124', from: 'JFK', to: 'CAI' },
      ]),
    ).toBe('MS 123 CAI -> JFK, MS 124 JFK -> CAI');
  });
});
