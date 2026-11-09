import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Airport } from './airport.schema.js';
import { Airline } from './provider.schema.js';

@Schema()
export class Cabin {
    @Prop({
        type: String,
        required: true,
        trim: true
    })
    name: string;

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

    @Prop({
        type: Number,
        required: true,
        min: 0,
        validate: Number.isFinite
    })
    seatPrice: number;
}

@Schema({ _id: false })
export class FlightStop {
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
        type: Types.ObjectId,
        ref: Airline.name,
        required: true
    })
    airlineId: Types.ObjectId;

    @Prop({
        type: Number,
        required: true,
        min: 1,
        validate: Number.isInteger
    })
    number: number;

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

    @Prop({
        type: Types.ObjectId,
        ref: Flight.name
    })
    roundTripFlightId: Types.ObjectId;

    @Prop({
        type: [Types.ObjectId],
        ref: Flight.name,
        default: []
    })
    connectingFlightIds: Types.ObjectId[];
}

export type FlightDocument = HydratedDocument<Flight>;
export const FlightSchema = SchemaFactory.createForClass(Flight);

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
});
