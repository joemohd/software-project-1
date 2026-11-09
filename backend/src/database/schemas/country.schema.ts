import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

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

    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 2,
        maxlength: 2,
        match: /^[a-z]{2}$/,
    })
    code: string;

    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 3,
        maxlength: 3,
        match: /^[a-z]{3}$/,
    })
    currency: string;

    @Prop({
        type: [String],
        default: []
    })
    imageUrls: string[];
}

export type CountryDocument = HydratedDocument<Country>;
export const CountrySchema = SchemaFactory.createForClass(Country);
