import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { City } from './city.schema.js';
import { User } from './user.schema.js';
import { Room } from './provider.schema.js';
import { Currency } from './currency.schema.js';
import { Cabin } from './flight.schema.js';

@Schema({
    collection: 'activity_categories',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class ActivityCategory {
    @Prop({
        type: String,
        required: true,
        trim: true,
        lowercase: true,
        minlength: 1,
        maxlength: 80
    })
    name: string;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true
    })
    userId: Types.ObjectId;
}

@Schema({ collection: 'expenses', timestamps: true, strict: 'throw', minimize: true, discriminatorKey: 'expenseType' })
export class Expense {
    @Prop({ type: String, enum: ['activity', 'transport', 'booking'], required: true })
    expenseType: 'activity' | 'transport' | 'booking';
    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100
    })
    name: string;

    @Prop({
        type: String,
        trim: true,
        maxlength: 1000
    })
    description: string;

    // TODO: Model monetary amounts as integers representing the smallest currency unit (USD)
    @Prop({
        type: Number,
        min: 0,
        validate: Number.isSafeInteger
    })
    cost: number;
}

export enum BookingStatus {
    PENDING_PAYMENT = 'pending payment',
    CONFIRMED = 'confirmed',
    COMPLETED = 'completed',
    EXPIRED = 'expired',
    CANCELLED = 'cancelled'
}

export enum PaymentStatus {
    PENDING = 'pending',
    SUCCESSFUL = 'successful',
    FAILED = 'failed'
}

export enum PaymentMethod {
    CARD = 'card',
    BANK_TRANSFER = 'bank transfer'
}

// TODO: Use the Checkout Sessions API instead of the Payment Intents API (also check against the functional requirements)
@Schema({ _id: false })
export class Payment {
    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 1,
        maxlength: 255
    })
    stripePaymentIntentId: string;

    // TODO: Model monetary amounts as integers representing the smallest currency unit(USD)
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isSafeInteger
    })
    amount: number;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Currency.name,
        required: true,
        index: true
    })
    currencyId: Types.ObjectId;

    // TODO: Make the enum compatible with Stripe's payment life cycle
    @Prop({
        type: String,
        enum: Object.values(PaymentStatus),
        required: true
    })
    status: PaymentStatus;

    @Prop({
        type: String,
        enum: Object.values(PaymentMethod),
        required: true
    })
    method: PaymentMethod;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: 'Refund'
    })
    refundId: Types.ObjectId;
}

// TODO: Check again after changing to the Stripe Checkout Sessions API
@Schema({
    collection: 'refunds',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Refund {
    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 1,
        maxlength: 255
    })
    stripeRefundId: string;

    // TODO: Model monetary amounts as integers representing the smallest currency unit (USD)
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isSafeInteger
    })
    amount: number;

    @Prop({
        type: String,
        enum: Object.values(PaymentStatus),
        required: true
    })
    status: PaymentStatus;

    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 500
    })
    reason: string;
}

@Schema({ _id: false, discriminatorKey: 'bookingType' })
export class Booking extends Expense {
    @Prop({ type: String, enum: ['hotel', 'flight'], required: true })
    bookingType: 'hotel' | 'flight';
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true,
        index: true
    })
    userId: Types.ObjectId;

    @Prop({
        type: Number,
        min: 1,
        max: 5,
        validate: Number.isInteger
    })
    rating: number;

    // TODO: Enforce the state-transition description
    @Prop({
        type: String,
        enum: Object.values(BookingStatus),
        required: true
    })
    status: BookingStatus;

    // TODO: Get back to it after changing the Stripe API
    @Prop({
        type: Payment,
        required: true
    })
    payment: Payment;
}

@Schema({ _id: false })
export class HotelBookingRoom {
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Room.name,
        required: true
    })
    roomId: Types.ObjectId;

    @Prop({
        type: [Number],
        required: true,
        default: [],
        validate: {
            validator: (ages: number[]) => ages.every((age) => Number.isInteger(age) && age >= 0),
            message: 'Guest ages must be non-negative integers'
        }
    })
    guestAges: number[];
}

@Schema({
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class HotelBooking extends Booking {
    // TODO: Make it is a future date
    @Prop({
        type: Date,
        required: true
    })
    startDate: Date;

    @Prop({
        type: Number,
        required: true,
        min: 1,
        validate: Number.isInteger
    })
    nightsCount: number;

    @Prop({
        type: [HotelBookingRoom],
        required: true,
        validate: {
            validator: (rooms: HotelBookingRoom[]) =>
                Array.isArray(rooms) &&
                rooms.length > 0 &&
                new Set(rooms.map((room) => room.roomId?.toString())).size === rooms.length,
            message: 'At least one room is required and room IDs must be unique'
        }
    })
    rooms: HotelBookingRoom[];
}

@Schema({ _id: false })
export class FlightPassenger {
    @Prop({
        type: Number,
        required: true,
        min: 1,
        validate: Number.isInteger
    })
    count: number;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Cabin.name,
        required: true
    })
    cabinId: Types.ObjectId;
}

@Schema({
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class FlightBooking extends Booking {
    @Prop({
        type: FlightPassenger,
        required: true
    })
    passenger: FlightPassenger;
}

@Schema({
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class Activity extends Expense {
    @Prop({ type: Date })
    time: Date; //optional

    // TODO: Enforce security measures later to make sure that the image URLs only come from our account on whatever cloud storage service we will use

    // TODO: Determine whether it is better to store asset identifier rather than URL from our cloud storage service provider
    @Prop({
        type: [String],
        default: [],
        validate: [
            {
                validator: (value: string[]) => value.length <= 5,
                message: 'An expense cannot have more than 5 images.'
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

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: ActivityCategory.name,
        required: true,
        index: true
    })
    categoryId: Types.ObjectId;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true,
        index: true
    })
    cityId: Types.ObjectId;
}

@Schema({
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class Transport extends Expense {
    @Prop({ type: Date })
    time: Date;

    @Prop({
        type: String,
        required: true,
        trim: true
    })
    mode:  string;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true,
        index: true
    })
    fromCityId: Types.ObjectId;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true,
        index: true
    })
    toCityId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: FlightBooking.name
    })
    flightBookingId?: Types.ObjectId;
}

export type ActivityCategoryDocument = HydratedDocument<ActivityCategory>;
export type ActivityDocument = HydratedDocument<Activity>;
export type TransportDocument = HydratedDocument<Transport>;
export type RefundDocument = HydratedDocument<Refund>;
export type HotelBookingDocument = HydratedDocument<HotelBooking>;
export type FlightBookingDocument = HydratedDocument<FlightBooking>;
export const ActivityCategorySchema = SchemaFactory.createForClass(ActivityCategory);
export const ExpenseSchema = SchemaFactory.createForClass(Expense);
export const ActivitySchema = SchemaFactory.createForClass(Activity);
export const TransportSchema = SchemaFactory.createForClass(Transport);
export const PaymentSchema = SchemaFactory.createForClass(Payment);
export const RefundSchema = SchemaFactory.createForClass(Refund);
export const BookingSchema = SchemaFactory.createForClass(Booking);
export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);
export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);
export const HotelBookingRoomSchema = SchemaFactory.createForClass(HotelBookingRoom);
export const FlightPassengerSchema = SchemaFactory.createForClass(FlightPassenger);

ActivityCategorySchema.index(
    { userId: 1, name: 1 },
    { unique: true }
);
