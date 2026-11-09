import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from './user.schema.js';

@Schema({
    collection: 'password_reset_tokens',
    timestamps: true,
    strict: true,
    minimize: true
})
export class PasswordResetToken {

    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true
    })
    user: Types.ObjectId;

    @Prop({
        type: String,
        required: true,
        unique: true
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
