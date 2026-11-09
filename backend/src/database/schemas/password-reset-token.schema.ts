import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from './user.schema.js';

@Schema({
    collection: 'password_reset_tokens',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class PasswordResetToken {

    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true,
        index: true
    })
    userId: Types.ObjectId;

    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        minlength: 1,
        maxlength: 255
    })
    tokenHash: string;

    @Prop({
        type: Date,
        required: true
    })
    expiresAt: Date;
}

export type PasswordResetTokenDocument = HydratedDocument<PasswordResetToken>;
export const PasswordResetTokenSchema = SchemaFactory.createForClass(PasswordResetToken);

PasswordResetTokenSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);
