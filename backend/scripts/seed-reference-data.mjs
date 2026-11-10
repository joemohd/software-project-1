import mongoose from 'mongoose';
import referenceData from '../src/database/seed/reference-data.json' with { type: 'json' };
import { CountrySchema } from '../dist/database/schemas/country.schema.js';
import { CurrencySchema } from '../dist/database/schemas/currency.schema.js';

const uri = process.env.MONGODB_URI;

if (!uri) {
    throw new Error('MONGODB_URI is required to seed reference data.');
}

let connection;
try {
    connection = await mongoose.createConnection(uri).asPromise();
    const Currency = connection.model('Currency', CurrencySchema);
    const Country = connection.model('Country', CountrySchema);

    await Currency.init();
    await Country.init();

    await Currency.bulkWrite(
        referenceData.currencies.map(({ currency, name }) => ({
            updateOne: {
                filter: { currency },
                update: { $set: { currency, name } },
                upsert: true
            }
        }))
    );

    const currencyDocuments = await Currency.find({
        currency: { $in: referenceData.currencies.map(({ currency }) => currency) }
    })
        .select('_id currency')
        .lean();
    const currencyIds = new Map(
        currencyDocuments.map(({ _id, currency }) => [currency, _id])
    );

    await Country.bulkWrite(
        referenceData.countries.map(({ code, name, currencies, timeZones }) => ({
            updateOne: {
                filter: { code },
                update: {
                    $set: {
                        code,
                        name,
                        currencyIds: currencies.map((currency) => {
                            const id = currencyIds.get(currency);
                            if (!id) {
                                throw new Error(`Missing seeded currency ${currency}.`);
                            }
                            return id;
                        }),
                        timeZones
                    },
                    $setOnInsert: { imageUrls: [] }
                },
                upsert: true
            }
        }))
    );

    await Country.collection.updateMany(
        {
            code: { $in: referenceData.countries.map(({ code }) => code) },
            currencyId: { $exists: true }
        },
        { $unset: { currencyId: '' } }
    );

    console.log(
        `Seeded ${referenceData.currencies.length} currencies and ${referenceData.countries.length} countries.`
    );
} catch {
    console.error('Reference data seeding failed. Check MongoDB connectivity, access rules, and database indexes.');
    process.exitCode = 1;
} finally {
    await connection?.close();
}
