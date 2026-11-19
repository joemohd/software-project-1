import { Types } from 'mongoose';
import { BookingStatus, PassengerType } from '../database/schemas/expense.schema.js';
import { CabinType } from '../database/schemas/flight.schema.js';
import {
  csvCell,
  MANIFEST_CSV_HEADER,
  ManifestBooking,
  manifestEntry,
  manifestFilename,
  manifestRows,
  neutraliseCell,
  toCsv,
} from './passenger-manifest.js';

describe('passenger manifest (FLT-29)', () => {
  const outboundId = new Types.ObjectId();
  const returnId = new Types.ObjectId();
  const booking: ManifestBooking = {
    _id: new Types.ObjectId(),
    reference: 'K7M2QX',
    status: BookingStatus.CONFIRMED,
    segments: [
      { flightId: outboundId, cabinName: CabinType.ECONOMY, seats: [{ passengerIndex: 0, row: 10, column: 'A' }, { passengerIndex: 2, row: 10, column: 'B' }] },
      { flightId: returnId, cabinName: CabinType.BUSINESS, seats: [{ passengerIndex: 0, row: 2, column: 'C' }, { passengerIndex: 2, row: 2, column: 'D' }] },
    ],
    passengers: [
      { fullName: 'Mona Hassan', type: PassengerType.ADULT, extraBagWeights: [20, 15] },
      { fullName: 'Baby Hassan', type: PassengerType.INFANT, extraBagWeights: [] },
      { fullName: 'Omar Hassan', type: PassengerType.CHILD, extraBagWeights: [] },
    ],
  };

  describe('manifestEntry', () => {
    it("uses the cabin and seats of the requested flight; infants have no seat", () => {
      expect(manifestEntry(booking, outboundId)).toEqual({
        id: booking._id.toString(),
        reference: 'K7M2QX',
        status: BookingStatus.CONFIRMED,
        cabinName: CabinType.ECONOMY,
        passengers: [
          { fullName: 'Mona Hassan', type: 'adult', seat: '10A', extraBagWeights: [20, 15] },
          { fullName: 'Baby Hassan', type: 'infant', seat: null, extraBagWeights: [] },
          { fullName: 'Omar Hassan', type: 'child', seat: '10B', extraBagWeights: [] },
        ],
      });
    });

    it('shows the return flight its own cabin and seats', () => {
      const entry = manifestEntry(booking, returnId);
      expect(entry.cabinName).toBe(CabinType.BUSINESS);
      expect(entry.passengers.map((p) => p.seat)).toEqual(['2C', null, '2D']);
    });

    it('never includes passport numbers, even if the record has them', () => {
      const withPassport = { ...booking, passengers: booking.passengers.map((p) => ({ ...p, passportNumber: 'SECRET123' })) };
      expect(JSON.stringify(manifestEntry(withPassport, outboundId))).not.toContain('SECRET123');
    });
  });

  it('makes one CSV row per passenger with the agreed columns', () => {
    expect(MANIFEST_CSV_HEADER).toEqual(['Reference', 'Passenger name', 'Type', 'Cabin', 'Seat', 'Extra bags', 'Status']);
    expect(manifestRows([manifestEntry(booking, outboundId)])).toEqual([
      ['K7M2QX', 'Mona Hassan', 'adult', 'Economy', '10A', '2', 'confirmed'],
      ['K7M2QX', 'Baby Hassan', 'infant', 'Economy', '', '0', 'confirmed'],
      ['K7M2QX', 'Omar Hassan', 'child', 'Economy', '10B', '0', 'confirmed'],
    ]);
  });

  describe('neutraliseCell', () => {
    it.each(['=SUM(A1:A9)', '+1', '-2+3', '@cmd', '\tTAB', '\r=1'])('prefixes %j with a quote', (value) => {
      expect(neutraliseCell(value)).toBe(`'${value}`);
    });

    it.each(['Mona Hassan', 'O\'Brien', 'K7M2QX', '10A', 'a=b', ''])('leaves %j alone', (value) => {
      expect(neutraliseCell(value)).toBe(value);
    });
  });

  describe('csvCell', () => {
    it('quotes commas, quotes and line breaks', () => {
      expect(csvCell('Hassan, Mona')).toBe('"Hassan, Mona"');
      expect(csvCell('Mona "M" Hassan')).toBe('"Mona ""M"" Hassan"');
      expect(csvCell('line\nbreak')).toBe('"line\nbreak"');
    });

    it('neutralises before quoting', () => {
      expect(csvCell('=HYPERLINK("http://x.test","click")')).toBe('"\'=HYPERLINK(""http://x.test"",""click"")"');
    });
  });

  it('builds a CSV with a BOM, a header row and CRLF line endings', () => {
    expect(toCsv(['A', 'B'], [['1', '=2'], ['x,y', '']])).toBe('﻿A,B\r\n1,\'=2\r\n"x,y",\r\n');
  });

  it('names the file after the airline, flight and local departure date, safe for a header', () => {
    expect(manifestFilename('MS', '123', '2026-12-20')).toBe('MS123-2026-12-20-passengers.csv');
    expect(manifestFilename('M"S', '1;2', '2026-12-20')).toBe('MS12-2026-12-20-passengers.csv');
  });
});
