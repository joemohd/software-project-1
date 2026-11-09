import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

@Schema({
    collection: 'tags',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Tag {
    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    })
    name: string;
}

export type TagDocument = HydratedDocument<Tag>;
export const TagSchema = SchemaFactory.createForClass(Tag);
