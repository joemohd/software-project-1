import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type HotelDocument = HydratedDocument<Hotel>;

/**
 * A cancellation tier (HTL-10). Selection rule (shared with FLT-09): among the
 * tiers whose `daysBeforeCheckIn` threshold is <= the actual days remaining
 * before check-in, the one with the HIGHEST threshold wins; if none qualify
 * the refund percentage is 0.
 */
@Schema({ _id: false })
export class CancellationTier {
  @Prop({ required: true, min: 0 })
  daysBeforeCheckIn: number;

  @Prop({ required: true, min: 0, max: 100 })
  refundPercent: number;
}
export const CancellationTierSchema =
  SchemaFactory.createForClass(CancellationTier);

/**
 * Hotel profile (HTL-01). SHARED SCHEMA — owned by the Hotels-CRUD teammate
 * (HTL-01/02/09/10). If they already define it, delete this file and import
 * theirs; the hotel-search/review code only reads these fields.
 */
@Schema({ timestamps: true, collection: 'hotels' })
export class Hotel {
  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ trim: true })
  address: string;

  @Prop({ required: true, trim: true, index: true })
  city: string;

  @Prop({ required: true, trim: true, index: true })
  country: string;

  @Prop({ default: '' })
  description: string;

  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ min: 1, max: 5 })
  starClass: number;

  @Prop({ type: [String], default: [] })
  amenities: string[];

  /** Standard check-in time, "HH:mm" (HTL-09). */
  @Prop({ default: '14:00' })
  checkInTime: string;

  /** Standard check-out time, "HH:mm" (HTL-09). */
  @Prop({ default: '11:00' })
  checkOutTime: string;

  @Prop({ type: [CancellationTierSchema], default: [] })
  cancellationTiers: CancellationTier[];

  /** The hotel moderator who manages this hotel (used for HTL-22 / HTL-26). */
  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  moderatorId: Types.ObjectId;

  /** Deactivated hotels are hidden from search (ACC-15). */
  @Prop({ default: true, index: true })
  active: boolean;

  /** Denormalised rating cache, recomputed on every review change (HTL-23). */
  @Prop({ default: 0, min: 0, max: 5 })
  averageRating: number;

  @Prop({ default: 0, min: 0 })
  ratingsCount: number;
}

export const HotelSchema = SchemaFactory.createForClass(Hotel);
