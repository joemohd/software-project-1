import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { City } from './city.schema.js';
import { User } from './user.schema.js';
import { Room } from './provider.schema.js';
import { CabinType, Flight } from './flight.schema.js';

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

@Schema({
    collection: 'expenses',
    timestamps: true,
    strict: 'throw',
    minimize: true,
    discriminatorKey: 'expenseType'
})
export class Expense {
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true,
        index: true
    })
    userId: Types.ObjectId;

    expenseType: 'activity' | 'transport' | 'hotel_booking' | 'flight_booking';

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

// PAY-01: Stripe PaymentIntent statuses (https://docs.stripe.com/payments/paymentintents/lifecycle)
export enum PaymentIntentStatus {
    REQUIRES_PAYMENT_METHOD = 'requires_payment_method',
    REQUIRES_CONFIRMATION = 'requires_confirmation',
    REQUIRES_ACTION = 'requires_action',
    PROCESSING = 'processing',
    REQUIRES_CAPTURE = 'requires_capture',
    CANCELED = 'canceled',
    SUCCEEDED = 'succeeded'
}

// PAY-01: only the Stripe payment id, amount, currency and status are stored (never card details)
@Schema({ _id: false })
export class Payment {
    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 255
    })
    paymentIntentId: string;

    // Integer cents
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isSafeInteger
    })
    amount: number;

    @Prop({
        type: String,
        required: true,
        lowercase: true,
        minlength: 3,
        maxlength: 3,
        match: /^[a-z]{3}$/
    })
    currency: string;

    @Prop({
        type: String,
        enum: Object.values(PaymentIntentStatus),
        required: true
    })
    status: PaymentIntentStatus;

    // Why the last attempt failed (Stripe's message), shown so the user can retry
    @Prop({ type: String, default: null, maxlength: 500 })
    lastError: string | null;
}

@Schema({
    collection: 'refunds',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Refund {
    // PAY-03: the cancelled booking this refund belongs to, and its owner (for GET /api/refunds/:id)
    @Prop({ type: Types.ObjectId, required: true, index: true })
    bookingId: Types.ObjectId;

    @Prop({ type: String, enum: ['flight', 'hotel'], required: true })
    bookingType: 'flight' | 'hotel';

    @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
    userId: Types.ObjectId;

    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 1,
        maxlength: 255
    })
    stripeRefundId: string;

    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isSafeInteger
    })
    amount: number;

    @Prop({ type: String, required: true, lowercase: true, minlength: 3, maxlength: 3, match: /^[a-z]{3}$/ })
    currency: string;

    @Prop({
        type: String,
        enum: ['pending', 'requires_action', 'succeeded', 'failed', 'canceled', null],
        default: null
    })
    status: 'pending' | 'requires_action' | 'succeeded' | 'failed' | 'canceled' | null;

    @Prop({
        type: String,
        enum: ['duplicate', 'expired_uncaptured_charge', 'fraudulent', 'requested_by_customer'],
        default: null
    })
    reason: 'duplicate' | 'expired_uncaptured_charge' | 'fraudulent' | 'requested_by_customer' | null;

    @Prop({ type: String, default: null })
    paymentIntentId: string | null;

    @Prop({ type: String, default: null })
    chargeId: string | null;

    @Prop({ type: String, default: null })
    balanceTransactionId: string | null;

    @Prop({ type: String, default: null })
    failureReason: string | null;

    @Prop({ type: Date, default: null })
    stripeCreatedAt: Date;
}

@Schema({
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true,
})
export class Booking extends Expense {

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

    // PAY-01: the Stripe PaymentIntent for this booking; null until the user starts paying
    @Prop({
        type: Payment,
        default: null
    })
    payment: Payment | null;

    @Prop({ type: Date, default: null })
    policiesAcceptedAt: Date | null;
}

@Schema({ _id: false })
export class RoomBooking {
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
    // TODO: The backend must prevent overlapping active booking dates for each room, including concurrent booking attempts.
    // TODO: Make sure it is a future date
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
        type: [RoomBooking],
        required: true,
        validate: {
            validator: (rooms: RoomBooking[]) =>
                Array.isArray(rooms) &&
                rooms.length > 0 &&
                new Set(rooms.map((room) => room.roomId?.toString())).size === rooms.length,
            message: 'At least one room is required and room IDs must be unique'
        }
    })
    rooms: RoomBooking[];
}

export enum PassengerType {
    ADULT = 'adult',
    CHILD = 'child',
    INFANT = 'infant'
}

@Schema({ _id: false })
export class FlightSeatAssignment {
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isInteger
    })
    passengerIndex: number;

    @Prop({
        type: Number,
        required: true,
        min: 1,
        validate: Number.isInteger
    })
    row: number;

    @Prop({
        type: String,
        required: true,
        uppercase: true,
        match: /^[A-Z]$/
    })
    column: string;
}

@Schema({ _id: false })
export class FlightSegment {
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Flight.name,
        required: true
    })
    flightId: Types.ObjectId;

    @Prop({
        type: String,
        enum: Object.values(CabinType),
        required: true
    })
    cabinName: CabinType;

    // Integer cents, copied from the cabin at booking time
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isSafeInteger
    })
    seatPrice: number;

    @Prop({
        type: [FlightSeatAssignment],
        default: []
    })
    seats: FlightSeatAssignment[];
}

@Schema({ _id: false })
export class FlightPassenger {
    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100
    })
    fullName: string;

    @Prop({
        type: Date,
        required: true
    })
    dateOfBirth: Date;

    @Prop({
        type: String,
        enum: Object.values(PassengerType),
        required: true
    })
    type: PassengerType;

    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 20
    })
    passportNumber: string;

    @Prop({
        type: [Number],
        default: [],
        validate: {
            validator: (weights: number[]) => weights.every((weight) => typeof weight === 'number' && weight > 0),
            message: 'Extra bag weights must be positive numbers'
        }
    })
    extraBagWeights: number[];
}

@Schema({
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class FlightBooking extends Booking {
    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 20
    })
    reference: string;

    @Prop({
        type: [FlightSegment],
        required: true,
        validate: {
            validator: (segments: FlightSegment[]) =>
                Array.isArray(segments) && segments.length >= 1 && segments.length <= 2,
            message: 'A flight booking must have one or two segments'
        }
    })
    segments: FlightSegment[];

    @Prop({
        type: [FlightPassenger],
        required: true,
        validate: {
            validator: (passengers: FlightPassenger[]) => Array.isArray(passengers) && passengers.length >= 1,
            message: 'At least one passenger is required'
        }
    })
    passengers: FlightPassenger[];

    // Integer cents
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isSafeInteger
    })
    fareTotal: number;

    // Integer cents
    @Prop({
        type: Number,
        min: 0,
        validate: Number.isSafeInteger,
        default: 0
    })
    baggageFee: number;

    @Prop({ type: Date, default: null })
    holdExpiresAt: Date | null;
}

@Schema({
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class Activity extends Expense {
    @Prop({ type: Date })
    time: Date;

    // TODO: Enforce security measures later to make sure that the image URLs only come from our account on whatever cloud storage service we will use
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

    // TODO: Verify that the user owns the category
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
    mode: string;

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
export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);
export const FlightBookingSchema = SchemaFactory.createForClass(FlightBooking);
export const BookingRoomSchema = SchemaFactory.createForClass(RoomBooking);
export const FlightPassengerSchema = SchemaFactory.createForClass(FlightPassenger);
export const FlightSegmentSchema = SchemaFactory.createForClass(FlightSegment);

ExpenseSchema.index({ userId: 1, createdAt: -1 });

// The expenses collection is shared by all expense types, so the unique index only covers
// documents that have a reference; otherwise every non-flight expense would collide on null.
FlightBookingSchema.index(
    { reference: 1 },
    { unique: true, partialFilterExpression: { reference: { $type: 'string' } } }
);
FlightBookingSchema.index({ 'segments.flightId': 1, status: 1 });
FlightBookingSchema.index({ status: 1, holdExpiresAt: 1 });

ActivityCategorySchema.index(
    { userId: 1, name: 1 },
    { unique: true }
);
