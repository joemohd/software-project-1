import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Airport } from './airport.schema.js';
import { Airline } from './provider.schema.js';

@Schema({ _id: false })
export class Cabin {
    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 50
    })
    name: string;

    // TODO: Unit should be kilograms
    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isFinite
    })
    freeBagWeight: number;

    @Prop({
        type: Number,
        required: true,
        min: 1,
        validate: Number.isInteger
    })
    seatCount: number;

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

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Flight.name
    })
    roundTripFlightId: Types.ObjectId;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: [Types.ObjectId],
        ref: Flight.name,
        default: [],
        validate: {
            validator: (ids: Types.ObjectId[]) => new Set(ids.map(id => id.toString())).size === ids.length,
            message: 'Duplicate connecting flights are not allowed.'
        }
    })
    connectingFlightIds: Types.ObjectId[];
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

    if (this.roundTripFlightId && this.roundTripFlightId.equals(this._id)) {
        this.invalidate(
            'roundTripFlightId',
            'A flight cannot be its own round trip'
        );
    }

    if (this.connectingFlightIds?.some((flightId) => flightId.equals(this._id))) {
        this.invalidate(
            'connectingFlightIds',
            'A flight cannot connect to itself'
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
