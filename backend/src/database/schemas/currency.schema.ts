import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

@Schema({
    collection: 'currencies',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Currency {
    @Prop({
        type: String,
        unique: true,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100
    })
    name: string;

    // ISO 4217 currency codes

    // TODO: Validate against an authoritative currencies list (e.g., ISO 4217: Currency codes)
    @Prop({
        type: String,
        required: true,
        trim: true,
        uppercase: true,
        minlength: 3,
        maxlength: 3,
        match: /^[A-Z]{3}$/
    })
    currency: string;
}

export type CurrencyDocument = HydratedDocument<Currency>;
export const CurrencySchema = SchemaFactory.createForClass(Currency);
