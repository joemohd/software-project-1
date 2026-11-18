import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Airport } from '../database/schemas/airport.schema.js';
import { City } from '../database/schemas/city.schema.js';
import { Country } from '../database/schemas/country.schema.js';
import { AirportListResponseDto, AirportResponseDto } from './dto/airport-response.dto.js';
import { ListAirportsQueryDto } from './dto/list-airports.dto.js';
import { PAGE_SIZE } from './flights.constants.js';

type AirportRecord = { _id: Types.ObjectId; iataCode: string; name: string; cityId: Types.ObjectId };
type CityRecord = { _id: Types.ObjectId; name: string; countryId: Types.ObjectId };
type CountryRecord = { _id: Types.ObjectId; code: string; name: string; timeZones: string[] };

/** Escapes user input so it is matched literally inside a MongoDB $regex. */
const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

@Injectable()
export class AirportsService {
  constructor(
    @InjectModel(Airport.name) private readonly airportModel: Model<Airport>,
    @InjectModel(City.name) private readonly cityModel: Model<City>,
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
  ) {}

  // FLT-02: predefined, read-only airport list (IATA code, name, city, country, IANA time zone)
  async list(query: ListAirportsQueryDto): Promise<AirportListResponseDto> {
    const page = query.page ?? 1;
    const filter = query.search ? this.searchFilter(query.search) : {};

    const [airports, total] = await Promise.all([
      this.airportModel
        .find(filter)
        .select('iataCode name cityId')
        .sort({ iataCode: 1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .lean<AirportRecord[]>()
        .exec(),
      this.airportModel.countDocuments(filter).exec(),
    ]);

    // Two batched lookups instead of one per airport
    const cities = await this.cityModel
      .find({ _id: { $in: airports.map((airport) => airport.cityId) } })
      .select('name countryId')
      .lean<CityRecord[]>()
      .exec();
    const countries = await this.countryModel
      .find({ _id: { $in: cities.map((city) => city.countryId) } })
      .select('code name timeZones')
      .lean<CountryRecord[]>()
      .exec();

    const cityById = new Map(cities.map((city) => [city._id.toString(), city]));
    const countryById = new Map(countries.map((country) => [country._id.toString(), country]));

    const items = airports.map((airport) => {
      const city = cityById.get(airport.cityId?.toString());
      const country = city ? countryById.get(city.countryId?.toString()) : undefined;
      return this.toResponse(airport, city, country);
    });

    return { items, page, pageSize: PAGE_SIZE, total };
  }

  private searchFilter(search: string) {
    const escaped = escapeRegex(search);
    return {
      $or: [
        { iataCode: { $regex: `^${escaped}`, $options: 'i' } },
        { name: { $regex: escaped, $options: 'i' } },
      ],
    };
  }

  private toResponse(airport: AirportRecord, city?: CityRecord, country?: CountryRecord): AirportResponseDto {
    return {
      id: airport._id.toString(),
      iataCode: airport.iataCode,
      name: airport.name,
      city: city ? { id: city._id.toString(), name: city.name } : null,
      country: country ? { id: country._id.toString(), code: country.code, name: country.name } : null,
      // TODO(FLT-02): read Airport.timeZone once the shared airport schema and seed get that field.
      // Until then the zone is only known for single-zone countries (e.g. EG -> Africa/Cairo);
      // multi-zone countries (US, CA, RU, BR, AU...) return null.
      timeZone: country?.timeZones?.length === 1 ? country.timeZones[0] : null,
    };
  }
}
