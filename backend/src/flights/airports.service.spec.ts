import { Types } from 'mongoose';
import { AirportsService } from './airports.service.js';
import { PAGE_SIZE } from './flights.constants.js';

/** Mimics a chainable mongoose query resolved by exec(). */
const query = (result: unknown) => {
  const q: Record<string, ReturnType<typeof vi.fn>> = { exec: vi.fn().mockResolvedValue(result) };
  for (const method of ['select', 'sort', 'skip', 'limit', 'lean']) q[method] = vi.fn().mockReturnValue(q);
  return q;
};

describe('AirportsService (FLT-02)', () => {
  const egypt = { _id: new Types.ObjectId(), code: 'EG', name: 'Egypt' };
  const usa = { _id: new Types.ObjectId(), code: 'US', name: 'United States' };
  const cairo = { _id: new Types.ObjectId(), name: 'Cairo', countryId: egypt._id, timeZone: 'Africa/Cairo' };
  const newYork = { _id: new Types.ObjectId(), name: 'New York', countryId: usa._id, timeZone: 'America/New_York' };
  const denver = { _id: new Types.ObjectId(), name: 'Denver', countryId: usa._id }; // no timeZone set
  const cai = { _id: new Types.ObjectId(), iataCode: 'CAI', name: 'Cairo International Airport', cityId: cairo._id };
  const jfk = { _id: new Types.ObjectId(), iataCode: 'JFK', name: 'John F. Kennedy International Airport', cityId: newYork._id };
  const den = { _id: new Types.ObjectId(), iataCode: 'DEN', name: 'Denver International Airport', cityId: denver._id };

  let airportFind: ReturnType<typeof query>;
  let cityFind: ReturnType<typeof query>;
  let countryFind: ReturnType<typeof query>;
  let airportModel: Record<string, ReturnType<typeof vi.fn>>;
  let service: AirportsService;

  const setup = (airports: unknown[], total = airports.length) => {
    airportFind = query(airports);
    cityFind = query([cairo, newYork, denver]);
    countryFind = query([egypt, usa]);
    airportModel = {
      find: vi.fn().mockReturnValue(airportFind),
      countDocuments: vi.fn().mockReturnValue(query(total)),
    };
    const cityModel = { find: vi.fn().mockReturnValue(cityFind) };
    const countryModel = { find: vi.fn().mockReturnValue(countryFind) };
    service = new AirportsService(airportModel as any, cityModel as any, countryModel as any);
  };

  it('returns airports with city, country and paging info', async () => {
    setup([cai], 1);

    const result = await service.list({});

    expect(result).toEqual({
      items: [
        {
          id: cai._id.toString(),
          iataCode: 'CAI',
          name: 'Cairo International Airport',
          city: { id: cairo._id.toString(), name: 'Cairo' },
          country: { id: egypt._id.toString(), code: 'EG', name: 'Egypt' },
          timeZone: 'Africa/Cairo',
        },
      ],
      page: 1,
      pageSize: PAGE_SIZE,
      total: 1,
    });
    expect(airportModel.find).toHaveBeenCalledWith({});
  });

  it("uses each airport's city time zone, including cities in multi-zone countries", async () => {
    setup([cai, jfk]);

    const zones = (await service.list({})).items.map((airport) => [airport.iataCode, airport.timeZone]);

    expect(zones).toEqual([
      ['CAI', 'Africa/Cairo'],
      ['JFK', 'America/New_York'],
    ]);
    expect(cityFind.select).toHaveBeenCalledWith('name countryId timeZone');
    expect(countryFind.select).toHaveBeenCalledWith('code name');
  });

  it('returns a null time zone when the city has none set', async () => {
    setup([den]);

    const [airport] = (await service.list({})).items;

    expect(airport).toMatchObject({ iataCode: 'DEN', city: { name: 'Denver' }, timeZone: null });
  });

  it('skips earlier pages using the fixed page size', async () => {
    setup([], 25);

    const result = await service.list({ page: 3 });

    expect(airportFind.skip).toHaveBeenCalledWith(2 * PAGE_SIZE);
    expect(airportFind.limit).toHaveBeenCalledWith(PAGE_SIZE);
    expect(result).toMatchObject({ items: [], page: 3, total: 25 });
  });

  it('searches the IATA prefix and the name, treating regex characters literally', async () => {
    setup([]);

    await service.list({ search: 'a.b(' });

    expect(airportModel.find).toHaveBeenCalledWith({
      $or: [
        { iataCode: { $regex: '^a\\.b\\(', $options: 'i' } },
        { name: { $regex: 'a\\.b\\(', $options: 'i' } },
      ],
    });
  });

  it('returns null city and country when the references are missing', async () => {
    setup([{ ...cai, cityId: new Types.ObjectId() }]);

    const [airport] = (await service.list({})).items;

    expect(airport).toMatchObject({ city: null, country: null, timeZone: null });
  });
});
