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
    // TODO: Perform referential integrity checks in the backend application
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
        minlength: 64,
        maxlength: 64,
        match: /^[a-f0-9]{64}$/
    })
    tokenHash: string;

    @Prop({
        type: Date,
        required: true,
        validate: {
            validator: (value: Date) => value.getTime() > Date.now(),
            message: 'Expiration date must be in the future.'
        }
    })
    expiresAt: Date;
}

export type PasswordResetTokenDocument = HydratedDocument<PasswordResetToken>;
export const PasswordResetTokenSchema = SchemaFactory.createForClass(PasswordResetToken);

// TODO: Do not rely on this index for TTL; MongoDB doesn't instantaneously delete the documents
PasswordResetTokenSchema.index(
    { expiresAt: 1 },
    { expireAfterSeconds: 0 }
);

PasswordResetTokenSchema.index(
    { userId: 1 },
    { unique: true }
);
