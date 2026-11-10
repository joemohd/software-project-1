import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from './user.schema.js';

export enum ItineraryVisibility {
    PUBLIC = 'public',
    PRIVATE = 'private'
}

@Schema({ _id: false })
export class ItineraryDay {
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: [Types.ObjectId],
        default: [],
        validate: {
            validator: (expenseIds: Types.ObjectId[]) => new Set(expenseIds.map(id => id.toString())).size === expenseIds.length,
            message: 'Duplicate expenses are not allowed.'
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
    // TODO: Perform referential integrity checks in the backend application
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
        minlength: 1,
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
    visibility: ItineraryVisibility;

    @Prop({
        type: [ItineraryDay],
        required: true,
        default: undefined,
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
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Itinerary.name,
        required: true,
        validate: {
            validator: function (this: ClonebaseItinerary, value: Types.ObjectId) {
                return value.toString() !== this.derivedItineraryId?.toString();
            },
            message: 'An itinerary cannot be cloned from itself.'
        }
    })
    baseItineraryId: Types.ObjectId;

    // TODO: Perform referential integrity checks in the backend application
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

ClonebaseItinerarySchema.index(
    { baseItineraryId: 1, derivedItineraryId: 1 },
    { unique: true }
);
