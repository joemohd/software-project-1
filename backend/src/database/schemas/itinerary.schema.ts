import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from './user.schema.js';

export enum ItineraryVisibility {
    PUBLIC = 'public',
    PRIVATE = 'private'
}

@Schema({ _id: false })
export class ItineraryDay {
    @Prop({
        type: [Types.ObjectId],
        default: [],
        validate: {
            validator: (expenseIds: Types.ObjectId[]) => expenseIds.every((expense) => expense instanceof Types.ObjectId),
            message: 'Each expense must be an ObjectId'
        }
    })
    expenseIds: Types.ObjectId[];
}

@Schema({
    collection: 'itineraries',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Itinerary {
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true
    })
    userId: Types.ObjectId;

    @Prop({
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    })
    title: string

    @Prop({
        type: Date,
        required: true
    })
    startDate: Date;

    @Prop({
        type: String,
        enum: Object.values(ItineraryVisibility),
        default: ItineraryVisibility.PRIVATE,
        required: true
    })
    visibility: ItineraryVisibility; //(default private)

    @Prop({
        type: [ItineraryDay],
        required: true,
        validate: {
            validator: (days: ItineraryDay[]) => Array.isArray(days) && days.length >= 1 && days.length <= 60,
            message: 'Itinerary must contain between 1 and 60 days'
        }
    })
    days: ItineraryDay[];
}

@Schema({
    collection: 'clonebase_itineraries',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class ClonebaseItinerary {
    @Prop({
        type: Types.ObjectId,
        ref: Itinerary.name,
        required: true
    })
    baseItineraryId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: Itinerary.name,
        required: true
    })
    derivedItineraryId: Types.ObjectId;
}

export type ItineraryDocument = HydratedDocument<Itinerary>;
export type ClonebaseItineraryDocument = HydratedDocument<ClonebaseItinerary>;
export const ItinerarySchema = SchemaFactory.createForClass(Itinerary);
export const ClonebaseItinerarySchema = SchemaFactory.createForClass(ClonebaseItinerary);
