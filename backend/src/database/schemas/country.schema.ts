import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Currency } from './currency.schema.js';

@Schema({
    collection: 'countries',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Country {
    @Prop({
        type: String,
        unique: true,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100
    })
    name: string;

    // ISO 3166-1 alpha-2 country codes

    // TODO: Validate against an authoritative countries list (e.g., ISO 3166-1: Country codes)
    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        uppercase: true,
        minlength: 2,
        maxlength: 2,
        match: /^[a-z]{2}$/,
    })
    code: string;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Currency.name,
        required: true,
        index: true
    })
    currencyId: Types.ObjectId;

    // TODO: Enforce security measures later to make sure that the image URLs only come from our account on whatever cloud storage service we will use

    // TODO: Determine whether it is better to store asset identifier rather than URL from our cloud storage service provider
    @Prop({
        type: [String],
        default: [],
        validate: [
            {
                validator: (value: string[]) => value.length <= 5,
                message: 'A country cannot have more than 5 images.'
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
}

export type CountryDocument = HydratedDocument<Country>;
export const CountrySchema = SchemaFactory.createForClass(Country);
