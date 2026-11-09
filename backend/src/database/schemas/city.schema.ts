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
        unique: true,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100
    })
    name: string;

    @Prop({
        type: Types.ObjectId,
        ref: Country.name,
        required: true,
        index: true
    })
    countryId: Types.ObjectId;

    @Prop({
        type: [String],
        default: []
    })
    imageUrls: string[];
}

export type CityDocument = HydratedDocument<City>;
export const CitySchema = SchemaFactory.createForClass(City);
