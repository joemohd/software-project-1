import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Country } from './country.schema.js';

@Schema({
    collection: 'cities',
    timestamps: true,
    strict: true,
    minimize: true
})
export class City {
    @Prop({
        type: String,
        unique: true,
        required: true,
        trim: true
    })
    name: string;

    @Prop({
        type: Types.ObjectId,
        ref: Country.name,
        required: true
    })
    country: Types.ObjectId;

    @Prop({
        type: [String]
    })
    imageUrls: string[];
}

export type CityDocument = HydratedDocument<City>;

export const CitySchema = SchemaFactory.createForClass(City);
