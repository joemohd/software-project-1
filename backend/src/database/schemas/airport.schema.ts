import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { City } from './city.schema.js';

@Schema({
    collection: 'airports',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Airport {
    @Prop({
        type: String,
        unique: true,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
        match: /^[A-Z]{3}$/
    })
    iataCode: string;

    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 200
    })
    name: string;

    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true,
        index: true
    })
    cityId: Types.ObjectId;

    @Prop({
        type: [String],
        default: []
    })
    imageUrls: string[];
}

export type AirportDocument = HydratedDocument<Airport>;
export const AirportSchema = SchemaFactory.createForClass(Airport);
