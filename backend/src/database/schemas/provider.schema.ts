import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Moderator } from './user.schema.js';
import { City } from './city.schema.js';

@Schema({ _id: false })
export class DaysBeforeService {
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isInteger
    })
    startDay: number;

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
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isFinite
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

@Schema({ _id: false })
export class CheckingPolicies {
    @Prop({
        type: Date,
        required: true,
        validate: {
            validator: function (this: CheckingPolicies, checkInTime: Date) { return !this.checkOutTime || checkInTime < this.checkOutTime; },
            message: 'Check-in must be before check-out'
        }
    })
    checkInTime: Date;

    @Prop({
        type: Date,
        required: true,
        validate: {
            validator: function (this: CheckingPolicies, checkOutTime: Date) { return !this.checkInTime || checkOutTime > this.checkInTime; },
            message: 'Check-out must be after check-in'
        }
    })
    checkOutTime: Date;
}

@Schema({
    collection: 'providers',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Provider {
    @Prop({
        type: Types.ObjectId,
        ref: Moderator.name,
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
    description: string;

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
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 1,
        maxlength: 32,
        match: /^[a-z0-9-]+$/
    })
    code: string;

    @Prop({ type: String })
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

    @Prop({
        type: [String],
        default: []
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
        default: []
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
    @Prop({
        type: Date,
        required: true
    })
    startDate: Date;

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

    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isFinite
    })
    pricePerNight: number;

    @Prop({
        type: [BlockedDateRange],
        default: [],
        validate: {
            validator: (ranges: BlockedDateRange[]) => ranges.every((range) => range.endDate >= range.startDate),
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
