import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Country } from './country.schema.js';

@Schema({
    collection: 'cities',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class City {
    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100
    })
    name: string;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Country.name,
        required: true,
        index: true
    })
    countryId: Types.ObjectId;

    // TODO: Enforce security measures later to make sure that the image URLs only come from our account on whatever cloud storage service we will use
    @Prop({
        type: [String],
        default: [],
        validate: [
            {
                validator: (value: string[]) => value.length <= 5,
                message: 'A city cannot have more than 5 images.'
            },
            {
                validator: (value: string[]) =>
                    value.every(url => {
                        try {
                            const parsed = new URL(url);
                            return ['http:', 'https:'].includes(parsed.protocol);
                        } catch {
                            return false;
                        }
                    }),
                message: 'Invalid image URL.'
            },
            {
                validator: (value: string[]) =>
                    new Set(value).size === value.length,
                message: 'Duplicate image URLs are not allowed.'
            }
        ]
    })
    imageUrls: string[];

    @Prop({
        type: String,
        validate: {
            validator: (timeZone: string) => {
                try {
                    new Intl.DateTimeFormat('en', { timeZone });
                    return true;
                } catch {
                    return false;
                }
            },
            message: 'City timezone must be a valid IANA identifier.'
        }
    })
    timeZone: string;
}

export type CityDocument = HydratedDocument<City>;
export const CitySchema = SchemaFactory.createForClass(City);

CitySchema.index(
    { name: 1, countryId: 1 },
    { unique: true }
);
