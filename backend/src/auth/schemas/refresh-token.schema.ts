import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from '../../database/schemas/user.schema.js';

/**
 * A server-side session (ACC-06). Only the SHA-256 hash of the refresh token is stored,
 * so a database leak does not expose usable tokens.
 * Each refresh rotates the token: the old document is deleted and a new one is created.
 */
@Schema({
  collection: 'refresh_tokens',
  timestamps: true,
  strict: 'throw',
  minimize: true,
})
export class RefreshToken {
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    required: true,
    unique: true,
    minlength: 64,
    maxlength: 64,
    match: /^[a-f0-9]{64}$/,
  })
  tokenHash: string;

  // Sliding idle expiry: pushed forward on every refresh
  @Prop({
    type: Date,
    required: true,
  })
  expiresAt: Date;
}

export type RefreshTokenDocument = HydratedDocument<RefreshToken>;
export const RefreshTokenSchema = SchemaFactory.createForClass(RefreshToken);

// Cleanup only: MongoDB's TTL monitor is not instant, so queries must still check expiresAt
RefreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
