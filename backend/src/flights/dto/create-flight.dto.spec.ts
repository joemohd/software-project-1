import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateFlightDto } from './create-flight.dto.js';

const validBody = () => ({
  airlineId: '665f1c2e9b1e8a0012345678',
  number: '123',
  departureAirportId: '665f1c2e9b1e8a001234567a',
  departureLocalTime: '2026-12-01T10:00',
  arrivalAirportId: '665f1c2e9b1e8a001234567b',
  arrivalLocalTime: '2026-12-01T14:30',
  maxBagWeight: 32,
  cabins: [{ name: 'Economy', seatPrice: 45000, freeBagWeight: 23, firstRow: 10, lastRow: 35, layout: 'ABC-DEF' }],
});

const failedFields = async (body: Record<string, unknown>) => {
  const errors = await validate(plainToInstance(CreateFlightDto, body));
  return errors.map((error) => error.property);
};

describe('CreateFlightDto (FLT-03, FLT-04)', () => {
  it('accepts a valid body', async () => {
    expect(await failedFields(validBody())).toEqual([]);
  });

  it.each([
    ['departureLocalTime', '2026-12-01T10:00Z'],
    ['departureLocalTime', '2026-12-01T10:00+02:00'],
    ['arrivalLocalTime', '2026-12-01 14:30'],
    ['number', '12345'],
    ['number', 'MS12'],
    ['maxBagWeight', 0],
    ['airlineId', 'not-an-id'],
  ])('rejects %s = %j', async (field, value) => {
    expect(await failedFields({ ...validBody(), [field]: value })).toContain(field);
  });

  it('requires at least one cabin', async () => {
    expect(await failedFields({ ...validBody(), cabins: [] })).toContain('cabins');
  });

  it.each([
    ['seatPrice', 0],
    ['seatPrice', 99.5],
    ['layout', 'abc-def'],
    ['firstRow', 0],
    ['name', 'Luxury'],
  ])('rejects cabin %s = %j', async (field, value) => {
    const body = validBody();
    body.cabins = [{ ...body.cabins[0], [field]: value }];
    expect(await failedFields(body)).toContain('cabins');
  });
});
