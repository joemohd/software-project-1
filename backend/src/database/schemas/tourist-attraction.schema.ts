import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { City } from './city.schema.js';

@Schema({
    collection: 'tourist_attractions',
    timestamps: true,
    strict: true,
    minimize: true
})
export class TouristAttraction {
    @Prop({
        type: String,
        required: true,
        trim: true
    })
    name: string;

    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true
    })
    city: Types.ObjectId;

    @Prop({
        type: [String]
    })
    imageUrls: string[];
}
