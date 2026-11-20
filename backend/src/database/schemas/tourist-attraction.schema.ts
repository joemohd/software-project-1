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

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: City.name,
        required: true,
        index: true
    })
    cityId: Types.ObjectId;

    // TODO: Enforce security measures later to make sure that the image URLs only come from our account on whatever cloud storage service we will use
    @Prop({
        type: [String],
        default: [],
        validate: [
            {
                validator: (value: string[]) => value.length <= 5,
                message: 'A tourist attraction cannot have more than 5 images.'
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
}

export type TouristAttractionDocument = HydratedDocument<TouristAttraction>;
export const TouristAttractionSchema = SchemaFactory.createForClass(TouristAttraction);
