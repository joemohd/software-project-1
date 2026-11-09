import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { City } from './city.schema.js';
import { User } from './user.schema.js';
import { Country } from './country.schema.js';
import { Room } from './provider.schema.js';

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
        minlength: 1,
        maxlength: 80
    })
    name: string;

    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true
    })
    userId: Types.ObjectId;
}

export enum TransportMode {
    BUS = 'bus',
    TRAIN = 'train',
    FLIGHT = 'flight',
    CAR = 'car'
}

@Schema({ _id: false })
export class Expense {
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

    @Prop({
        type: Number,
        min: 0,
        validate: Number.isFinite
    })
    cost: number;
}

@Schema({
    collection: 'activities',
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class Activity extends Expense {
    @Prop({ type: Date })
    time: Date; //optional

    @Prop({
        type: [String],
        default: []
    })
    imageUrls: string[]; //optional

    @Prop({
        type: Types.ObjectId,
        ref: ActivityCategory.name,
        required: true,
        index: true
    })
    categoryId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true,
        index: true
    })
    cityId: Types.ObjectId;
}

@Schema({
    collection: 'transports',
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
        enum: [...Object.values(TransportMode), 'other'],
        required: true,
        trim: true
    })
    mode: TransportMode | 'other'; // allows for other in the forms (string)

    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true,
        index: true
    })
    fromCityId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true,
        index: true
    })
    toCityId: Types.ObjectId;
}

@Schema({
    collection: 'flight_transports',
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class FlightTransport extends Transport {
    @Prop({
        type: Types.ObjectId,
        ref: 'FlightBooking',
        required: true,
        index: true
    })
    flightBookingId: Types.ObjectId;
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

    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isFinite
    })
    amount: number;

    @Prop({
        type: Types.ObjectId,
        ref: Country.name,
        required: true
    })
    currencyCountryId: Types.ObjectId;

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

    @Prop({
        type: Types.ObjectId,
        ref: 'Refund'
    })
    refundId: Types.ObjectId; //optional
}

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

    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isFinite
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

@Schema({ _id: false })
export class Booking extends Expense {
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
        validate: Number.isFinite
    })
    rating: number;

    @Prop({
        type: String,
        enum: Object.values(BookingStatus),
        required: true
    })
    status: BookingStatus;

    @Prop({
        type: Payment,
        required: true
    })
    payment: Payment;
}

@Schema({ _id: false })
export class HotelBookingRoom {
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
            message: 'Guest ages must be whole numbers greater than 0'
        }
    })
    guestAges: number[];
}

@Schema({
    collection: 'hotel_bookings',
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class HotelBooking extends Booking {
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
            validator: (rooms: HotelBookingRoom[]) => Array.isArray(rooms) && rooms.length > 0,
            message: 'At least one room is required'
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

    @Prop({
        type: Types.ObjectId,
        required: true
    })
    cabinId: Types.ObjectId;
}

@Schema({
    collection: 'flight_bookings',
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

export type ActivityCategoryDocument = HydratedDocument<ActivityCategory>;
export type ActivityDocument = HydratedDocument<Activity>;
export type TransportDocument = HydratedDocument<Transport>;
export type FlightTransportDocument = HydratedDocument<FlightTransport>;
export type RefundDocument = HydratedDocument<Refund>;
export type HotelBookingDocument = HydratedDocument<HotelBooking>;
export type FlightBookingDocument = HydratedDocument<FlightBooking>;
export const ActivityCategorySchema = SchemaFactory.createForClass(ActivityCategory);
export const ActivitySchema = SchemaFactory.createForClass(Activity);
export const TransportSchema = SchemaFactory.createForClass(Transport);
export const FlightTransportSchema = SchemaFactory.createForClass(FlightTransport);
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
