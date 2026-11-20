import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from './user.schema.js';
import { City } from './city.schema.js';

export enum ItineraryVisibility {
    PUBLIC = 'public',
    PRIVATE = 'private'
}

// ITN-14: the four per-day budget categories
export enum BudgetCategory {
    FOOD = 'food',
    ACCOMMODATION = 'accommodation',
    IN_CITY_TRANSPORT = 'inCityTransport',
    ACTIVITIES = 'activities'
}

const currencyCode = {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    match: /^[A-Z]{3}$/
};

const imageUrlsValidator = [
    {
        validator: (value: string[]) => value.length <= 5,
        message: 'An activity cannot have more than 5 images.'
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
        validator: (value: string[]) => new Set(value).size === value.length,
        message: 'Duplicate image URLs are not allowed.'
    }
];

// ITN-10, ITN-12: an activity belongs to exactly one day (embedded, parent-owned data)
@Schema({ _id: true, timestamps: false })
export class ItineraryActivity {
    _id: Types.ObjectId;

    @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 100 })
    name: string;

    @Prop({ type: String, trim: true, maxlength: 1000, default: '' })
    description: string;

    // Optional local time of day, "HH:mm"
    @Prop({ type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ })
    time: string | null;

    @Prop({ type: Number, min: 0, default: null })
    cost: number | null;

    @Prop({ ...currencyCode, required: false, default: null })
    currency: string | null;

    @Prop({ type: [String], default: [], validate: imageUrlsValidator })
    imageUrls: string[];
}

// ITN-14: a non-negative budget entry of a day, in its own currency
@Schema({ _id: true, timestamps: false })
export class BudgetEntry {
    _id: Types.ObjectId;

    @Prop({ type: String, enum: Object.values(BudgetCategory), required: true })
    category: BudgetCategory;

    @Prop({ type: Number, required: true, min: 0 })
    amount: number;

    @Prop(currencyCode)
    currency: string;

    @Prop({ type: String, trim: true, maxlength: 200, default: '' })
    note: string;
}

// ITN-05, ITN-09: a day has a city (from the shared city list) and notes; its number and date are derived
@Schema({ _id: true, timestamps: false })
export class ItineraryDay {
    _id: Types.ObjectId;

    // TODO: Perform referential integrity checks in the backend application (done in ItinerariesService)
    @Prop({ type: Types.ObjectId, ref: City.name, required: true })
    cityId: Types.ObjectId;

    @Prop({ type: String, trim: true, maxlength: 2000, default: '' })
    notes: string;

    @Prop({ type: [SchemaFactory.createForClass(ItineraryActivity)], default: [] })
    activities: ItineraryActivity[];

    @Prop({ type: [SchemaFactory.createForClass(BudgetEntry)], default: [] })
    budgets: BudgetEntry[];
}

// ITN-16: intercity transport cost, attached to one day of the itinerary
@Schema({ _id: true, timestamps: false })
export class TransportCost {
    _id: Types.ObjectId;

    @Prop({ type: String, required: true, trim: true, minlength: 1, maxlength: 50 })
    mode: string;

    @Prop({ type: Types.ObjectId, ref: City.name, required: true })
    fromCityId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: City.name, required: true })
    toCityId: Types.ObjectId;

    @Prop({ type: Number, required: true, min: 0 })
    amount: number;

    @Prop(currencyCode)
    currency: string;

    @Prop({ type: Types.ObjectId, required: true })
    dayId: Types.ObjectId;
}

// ITN-21: credit kept on a clone; a name snapshot so the credit survives deletion of the original
@Schema({ _id: false })
export class CloneAttribution {
    @Prop({ type: Types.ObjectId, required: true })
    itineraryId: Types.ObjectId;

    @Prop({ type: Types.ObjectId, ref: 'User', required: true })
    authorId: Types.ObjectId;

    @Prop({ type: String, required: true })
    authorName: string;

    @Prop({ type: String, required: true })
    title: string;
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

    // ITN-01: ISO 3166-1 alpha-2 codes of seeded countries (at least one)
    @Prop({
        type: [String],
        required: true,
        validate: {
            validator: (codes: string[]) =>
                Array.isArray(codes) && codes.length >= 1 && codes.every(code => /^[A-Z]{2}$/.test(code)),
            message: 'An itinerary needs at least one valid country code.'
        }
    })
    countries: string[];

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

    // ITN-05: ordered days; the array position is the day number, dates derive from startDate
    @Prop({
        type: [SchemaFactory.createForClass(ItineraryDay)],
        default: [],
        validate: {
            validator: (days: ItineraryDay[]) => Array.isArray(days) && days.length <= 60,
            message: 'An itinerary can have at most 60 days'
        }
    })
    days: ItineraryDay[];

    // ITN-16
    @Prop({ type: [SchemaFactory.createForClass(TransportCost)], default: [] })
    transportCosts: TransportCost[];

    // ITN-21: set on clones only
    @Prop({ type: CloneAttribution, default: null })
    clonedFrom: CloneAttribution | null;

    // GEN-10: hidden by an admin; visible only to its author and admins
    @Prop({ type: Boolean, default: false })
    isHidden: boolean;
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

ItinerarySchema.index({ userId: 1, visibility: 1, updatedAt: -1 });
ItinerarySchema.index({ visibility: 1, startDate: 1 });
// Lookups for the flat routes /activities/:id, /budgets/:id, /transport-costs/:id
ItinerarySchema.index({ 'days.activities._id': 1 });
ItinerarySchema.index({ 'days.budgets._id': 1 });
ItinerarySchema.index({ 'transportCosts._id': 1 });

ClonebaseItinerarySchema.index(
    { baseItineraryId: 1, derivedItineraryId: 1 },
    { unique: true }
);
