import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { City } from './city.schema.js';
import { User } from './user.schema.js';

@Schema({ _id: false })
export class DaysBeforeService {
    // inclusive
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isInteger
    })
    startDay: number;

    // exclusive, may be null for open-ended intervals
    @Prop({
        type: Number,
        default: null,
        min: 0,
        validate: (value: number | null) => value === null || Number.isInteger(value)
    })
    endDay: number | null;
}

@Schema({ _id: false })
export class CancellationPolicy {
    @Prop({
        type: DaysBeforeService,
        required: true,
        validate: {
            validator: (period: DaysBeforeService) => Boolean(period) && (period.endDay === null || period.endDay > period.startDay),
            message: 'endDay must be greater than startDay or null for an open-ended policy'
        }
    })
    daysBeforeService: DaysBeforeService;

    @Prop({
        type: Number,
        required: true,
        min: 0,
        max: 100
    })
    refundPercentage: number;
}

@Schema({ _id: false })
export class BagPolicy {
    // TODO: Model monetary amounts as integers representing the smallest currency unit (USD)
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isSafeInteger
    })
    priceExtraBag: number;

    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isInteger
    })
    maxExtraBagCount: number;
}

// Time is stored as minutes after midnight
@Schema({ _id: false })
export class CheckingPolicies {
    @Prop({
        type: Number,
        required: true,
        min: 0,
        max: 1439,
        validate: Number.isInteger
    })
    checkInTime: number;

    @Prop({
        type: Number,
        required: true,
        min: 0,
        max: 1439,
        validate: [
            {
                validator: Number.isInteger,
                message: 'Check-out time must be an integer.'
            },
            {
                validator: function (this: CheckingPolicies, value: number) {
                    return this.checkInTime === undefined || value > this.checkInTime;
                },
                message: 'Check-out must be after check-in.'
            }
        ]
    })
    checkOutTime: number;
}

// TODO: Remodel the inheritance so that the unique constraint on the id is enforced across hotels and airlines
@Schema({
    collection: 'providers',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Provider {
    // TODO: Perform referential integrity checks in the backend application

    // TODO: Make sure that the user is a moderator in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true,
        unique: true
    })
    moderatorId: Types.ObjectId;

    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 120
    })
    name: string;

    @Prop({
        type: String,
        trim: true,
        maxlength: 2000
    })
    description?: string;

    // TODO: Should allow for fractional ratings

    // TODO: Auto-calculated upon new reviews
    @Prop({
        type: Number,
        min: 0,
        max: 5,
        default: 0,
        validate: Number.isFinite
    })
    averageRating: number;

    @Prop({
        type: String,
        required: true,
        validate: [{
            validator: (value: string) => {
                if (!value) return true;

                try {
                    const parsed = new URL(value);
                    return ['http:', 'https:'].includes(parsed.protocol);
                } catch {
                    return false;
                }
            },
            message: 'Invalid image URL.'
        }]
    })
    logoUrl: string;

    @Prop({
        type: [CancellationPolicy],
        default: [],
        validate: {
            validator: (policies: CancellationPolicy[]) => policies.every((policy) => policy.refundPercentage >= 0 && policy.refundPercentage <= 100),
            message: 'Refund percentage must be between 0 and 100'
        }
    })
    cancellationPolicies: CancellationPolicy[];
}

// TODO: Add IATA codes
@Schema({
    collection: 'airlines',
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class Airline extends Provider {
    @Prop({
        type: BagPolicy,
        required: true
    })
    bagPolicies: BagPolicy;
}

@Schema({
    collection: 'hotels',
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class Hotel extends Provider {
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true
    })
    cityId: Types.ObjectId;

    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 300
    })
    address: string;

    // TODO: Enforce security measures later to make sure that the image URLs only come from our account on whatever cloud storage service we will use

    // TODO: Determine whether it is better to store asset identifier rather than URL from our cloud storage service provider
    @Prop({
        type: [String],
        default: [],
        validate: [
            {
                validator: (value: string[]) => value.length <= 5,
                message: 'A hotel cannot have more than 5 images.'
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

    @Prop({
        type: Number,
        min: 1,
        max: 5,
        required: true,
        validate: Number.isInteger
    })
    starClass: number;

    @Prop({
        type: [String],
        default: [],
        validate: [
            {
                validator: (value: string[]) =>
                    value.length <= 50,
                message: 'Maximum of 50 amenities allowed.'
            },
            {
                validator: (value: string[]) =>
                    value.every(item =>
                        item.trim().length > 0 &&
                        item.trim().length <= 50
                    ),
                message: 'Invalid amenity.'
            },
            {
                validator: (value: string[]) =>
                    new Set(value.map(item =>
                        item.trim().toLowerCase()
                    )).size === value.length,
                message: 'Duplicate amenities are not allowed.'
            }
        ]
    })
    amenities: string[];

    @Prop({
        type: Boolean,
        default: true,
        required: true
    })
    isActive: boolean;

    @Prop({
        type: CheckingPolicies,
        required: true
    })
    checkingPolicies: CheckingPolicies;
}

@Schema({
    collection: 'room_types',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class RoomType {
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Hotel.name,
        required: true
    })
    hotelId: Types.ObjectId;

    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100
    })
    name: string;
}

@Schema({ _id: false })
export class BlockedDateRange {
    // inclusive
    @Prop({
        type: Date,
        required: true
    })
    startDate: Date;

    // exclusive
    @Prop({
        type: Date,
        required: true
    })
    endDate: Date;
}

@Schema({
    collection: 'rooms',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Room {
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Hotel.name,
        required: true
    })
    hotelId: Types.ObjectId;

    @Prop({
        type: Number,
        required: true,
        min: 1,
        validate: Number.isInteger
    })
    number: number;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: RoomType.name,
        required: true
    })
    roomTypeId: Types.ObjectId;

    @Prop({
        type: Number,
        required: true,
        min: 1,
        validate: Number.isInteger
    })
    bedCount: number;

    @Prop({
        type: Number,
        required: true,
        min: 1,
        validate: Number.isInteger
    })
    maxOccupancy: number;

    // TODO: Model monetary amounts as integers representing the smallest currency unit (USD)
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isSafeInteger
    })
    pricePerNight: number;

    // TODO: Reject overlapping blocked date ranges
    @Prop({
        type: [BlockedDateRange],
        default: [],
        validate: {
            validator: (ranges: BlockedDateRange[]) => ranges.every((range) => range.endDate > range.startDate),
            message: 'Blocked date end must be on or after its start'
        }
    })
    blockedDates: BlockedDateRange[];

    @Prop({
        type: Boolean,
        required: true,
        default: true
    })
    isActive: boolean;
}

export type ProviderDocument = HydratedDocument<Provider>;
export type AirlineDocument = HydratedDocument<Airline>;
export type HotelDocument = HydratedDocument<Hotel>;
export type RoomTypeDocument = HydratedDocument<RoomType>;
export type RoomDocument = HydratedDocument<Room>;
export const ProviderSchema = SchemaFactory.createForClass(Provider);
export const AirlineSchema = SchemaFactory.createForClass(Airline);
export const HotelSchema = SchemaFactory.createForClass(Hotel);
export const RoomTypeSchema = SchemaFactory.createForClass(RoomType);
export const RoomSchema = SchemaFactory.createForClass(Room);
export const DaysBeforeServiceSchema = SchemaFactory.createForClass(DaysBeforeService);

RoomTypeSchema.index(
    { hotelId: 1, name: 1 },
    { unique: true }
);

RoomSchema.index(
    { hotelId: 1, number: 1 },
    { unique: true }
);
