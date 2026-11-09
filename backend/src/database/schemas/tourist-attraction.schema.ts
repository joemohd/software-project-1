import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { City } from './city.schema.js';

@Schema({
    collection: 'tourist_attractions',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class TouristAttraction {
    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 150
    })
    name: string;

    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true,
        index: true
    })
    cityId: Types.ObjectId;

    @Prop({
        type: [String],
        default: []
    })
    imageUrls: string[];
}

export type TouristAttractionDocument = HydratedDocument<TouristAttraction>;
export const TouristAttractionSchema = SchemaFactory.createForClass(TouristAttraction);
