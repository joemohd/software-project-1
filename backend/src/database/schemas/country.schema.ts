import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({
    collection: 'countries',
    timestamps: true,
    strict: true,
    minimize: true
})
export class Country {
    @Prop({
        type: String,
        unique: true,
        required: true,
        trim: true
    })
    name: string;

    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    })
    code: string;

    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
    })
    currency: string;

    @Prop({
        type: [String]
    })
    imageUrls: string[];
}

export type CountryDocument = HydratedDocument<Country>;

export const CountrySchema = SchemaFactory.createForClass(Country);
