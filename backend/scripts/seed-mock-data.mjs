import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import mongoose from 'mongoose';
import { AirportSchema } from '../dist/database/schemas/airport.schema.js';
import { CitySchema } from '../dist/database/schemas/city.schema.js';
import { CountrySchema } from '../dist/database/schemas/country.schema.js';
import { TouristAttractionSchema } from '../dist/database/schemas/tourist-attraction.schema.js';

const uri = process.env.MONGODB_URI;
if (!uri) {
    throw new Error('MONGODB_URI is required to seed mock data.');
}

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const mockDataDirectory = path.join(projectRoot, 'docs/mock-data');

function parseCsv(contents, fileName) {
    const lines = contents.trimEnd().split(/\r?\n/);
    if (lines.length < 2) {
        throw new Error(`${fileName} must contain a header and at least one row.`);
    }

    const parseRow = (line) => {
        const values = [];
        let value = '';
        let quoted = false;

        for (let i = 0; i < line.length; i += 1) {
            const character = line[i];
            if (character === '"') {
                if (quoted && line[i + 1] === '"') {
                    value += '"';
                    i += 1;
                } else {
                    quoted = !quoted;
                }
            } else if (character === ',' && !quoted) {
                values.push(value);
                value = '';
            } else {
                value += character;
            }
        }

        if (quoted) {
            throw new Error(`${fileName} contains an unterminated quoted field.`);
        }
        values.push(value);
        return values;
    };

    const headers = parseRow(lines[0]);
    return lines.slice(1).map((line, index) => {
        const values = parseRow(line);
        if (values.length !== headers.length) {
            throw new Error(`${fileName} row ${index + 2} has the wrong number of columns.`);
        }
        return Object.fromEntries(headers.map((header, column) => [header, values[column].trim()]));
    });
}

async function readCsv(fileName) {
    return parseCsv(await readFile(path.join(mockDataDirectory, fileName), 'utf8'), fileName);
}

const [cityRows, airportRows, attractionRows] = await Promise.all([
    readCsv('Mock Data - Cities.csv.csv'),
    readCsv('Mock Data - Airports.csv.csv'),
    readCsv('Mock Data - Attractions.csv.csv')
]);

let connection;
try {
    connection = await mongoose.createConnection(uri).asPromise();
    const Country = connection.model('Country', CountrySchema);
    const City = connection.model('City', CitySchema);
    const Airport = connection.model('Airport', AirportSchema);
    const TouristAttraction = connection.model('TouristAttraction', TouristAttractionSchema);

    await Promise.all([
        Country.init(),
        City.init(),
        Airport.init(),
        TouristAttraction.init()
    ]);

    const countryDocuments = await Country.find({ code: { $in: cityRows.map(({ countryCode }) => countryCode) } })
        .select('_id code')
        .lean();
    const countryIds = new Map(countryDocuments.map(({ _id, code }) => [code, _id]));
    const missingCountryCodes = [...new Set(cityRows.map(({ countryCode }) => countryCode))]
        .filter((code) => !countryIds.has(code));
    if (missingCountryCodes.length) {
        throw new Error(`Countries are missing from the database: ${missingCountryCodes.join(', ')}.`);
    }

    await City.bulkWrite(cityRows.map(({ name, countryCode }) => ({
        updateOne: {
            filter: { name, countryId: countryIds.get(countryCode) },
            update: {
                $set: { name, countryId: countryIds.get(countryCode) },
                $setOnInsert: { imageUrls: [] }
            },
            upsert: true
        }
    })));

    const cityCountryCodes = [...new Set([
        ...airportRows.map(({ cityName, countryCode }) => `${cityName}|${countryCode}`),
        ...attractionRows.map(({ cityName, countryCode }) => `${cityName}|${countryCode}`)
    ])];
    const cityIds = new Map();
    for (const key of cityCountryCodes) {
        const [cityName, countryCode] = key.split('|');
        const countryId = countryIds.get(countryCode);
        const city = await City.findOne({ name: cityName, countryId }).select('_id').lean();
        if (city) {
            cityIds.set(key, city._id);
        }
    }
    const missingCityKeys = cityCountryCodes.filter((key) => !cityIds.has(key));
    if (missingCityKeys.length) {
        throw new Error(`Cities are missing from the database: ${missingCityKeys.join(', ')}.`);
    }

    await Airport.bulkWrite(airportRows.map(({ iataCode, name, cityName, countryCode }) => ({
        updateOne: {
            filter: { iataCode },
            update: {
                $set: { iataCode, name, cityId: cityIds.get(`${cityName}|${countryCode}`) },
                $setOnInsert: { imageUrls: [] }
            },
            upsert: true
        }
    })));

    await TouristAttraction.bulkWrite(attractionRows.map(({ name, cityName, countryCode }) => ({
        updateOne: {
            filter: { name, cityId: cityIds.get(`${cityName}|${countryCode}`) },
            update: {
                $set: { name, cityId: cityIds.get(`${cityName}|${countryCode}`) },
                $setOnInsert: { imageUrls: [] }
            },
            upsert: true
        }
    })));

    console.log(`Seeded ${cityRows.length} cities, ${airportRows.length} airports, and ${attractionRows.length} tourist attractions from CSV. Existing countries were read only.`);
} catch {
    console.error('Mock data seeding failed. Check MongoDB connectivity, reference records, and database indexes.');
    process.exitCode = 1;
} finally {
    await connection?.close();
}
