import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Airport } from './airport.schema.js';
import { Airline } from './provider.schema.js';

export enum FlightStatus {
    SCHEDULED = 'scheduled',
    CANCELLED = 'cancelled',
    DEPARTED = 'departed'
}

export enum CabinType {
    ECONOMY = 'Economy',
    PREMIUM_ECONOMY = 'Premium Economy',
    BUSINESS = 'Business',
    FIRST = 'First'
}

export enum SeatType {
    WINDOW = 'window',
    MIDDLE = 'middle',
    AISLE = 'aisle'
}

export enum SeatAvailability {
    AVAILABLE = 'available',
    HELD = 'held',
    BOOKED = 'booked',
    BLOCKED = 'blocked'
}

@Schema({ _id: false })
export class Seat {
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

    @Prop({
        type: String,
        enum: Object.values(SeatType),
        required: true
    })
    type: SeatType;

    @Prop({
        type: String,
        enum: Object.values(SeatAvailability),
        default: SeatAvailability.AVAILABLE,
        required: true
    })
    availability: SeatAvailability;
}

@Schema({ _id: false })
export class Cabin {
    @Prop({
        type: String,
        enum: Object.values(CabinType),
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 50
    })
    name: CabinType;

    // TODO: Unit should be kilograms
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isFinite
    })
    freeBagWeight: number;

    @Prop({
        type: [Seat],
        default: [],
        validate: {
            validator: (seats: Seat[]) =>
                Array.isArray(seats) &&
                new Set(seats.map((seat) => `${seat.row}:${String(seat.column).toUpperCase()}`)).size === seats.length,
            message: 'Seat row and column coordinates must be unique within a cabin'
        }
    })
    seats: Seat[];

    // TODO: Model monetary amounts as integers representing the smallest currency unit (USD)
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isSafeInteger
    })
    seatPrice: number;
}

@Schema({ _id: false })
export class FlightStop {
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Airport.name,
        required: true
    })
    airportId: Types.ObjectId;

    @Prop({
        type: Date,
        required: true
    })
    timestamp: Date;
}

@Schema({
    collection: 'flights',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Flight {
    @Prop({
        type: String,
        enum: Object.values(FlightStatus),
        default: FlightStatus.SCHEDULED,
        required: true
    })
    status: FlightStatus;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Airline.name,
        required: true
    })
    airlineId: Types.ObjectId;

    // IATA Standard flight numbers
    @Prop({
        type: String,
        required: true,
        match: /^\d{1,4}$/
    })
    number: string;

    @Prop({
        type: FlightStop,
        required: true
    })
    departure: FlightStop;

    @Prop({
        type: FlightStop,
        required: true
    })
    arrival: FlightStop;

    @Prop({
        type: [Cabin],
        required: true,
        validate: {
            validator: (cabins: Cabin[]) => Array.isArray(cabins) && cabins.length > 0 && new Set(cabins.map((cabin) => cabin.name.trim().toLowerCase())).size === cabins.length,
            message: 'A flight needs at least one cabin with unique names'
        }
    })
    cabins: Cabin[];

    @Prop({
        type: Number,
        required: true,
        min: 0, validate:
        Number.isFinite
    })
    maxBagWeight: number;
}

export type FlightDocument = HydratedDocument<Flight>;
export const FlightSchema = SchemaFactory.createForClass(Flight);

FlightSchema.index(
    { airlineId: 1, number: 1, 'departure.timestamp': 1 },
    { unique: true }
);

FlightSchema.pre('validate', function () {
    if (this.departure?.timestamp && this.arrival?.timestamp && this.departure.timestamp >= this.arrival.timestamp) {
        this.invalidate(
            'arrival.timestamp',
            'Arrival must be after departure'
        );
    }

    if (this.departure?.timestamp && this.arrival?.timestamp && this.departure.timestamp >= this.arrival.timestamp) {
        this.invalidate(
            'arrival.timestamp',
            'Arrival must be after departure'
        );
    }

    if (this.cabins?.some(cabin => cabin.freeBagWeight > this.maxBagWeight)) {
        this.invalidate(
            'cabins',
            'Cabin free baggage allowance cannot exceed maximum baggage weight.'
        );
    }
});
