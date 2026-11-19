import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

/** A hotel moderator's reply to a review (HTL-26, optional bonus). */
@Schema({ _id: false })
export class ReviewReply {
  @Prop({ required: true, trim: true, maxlength: 1000 })
  text: string;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  moderatorId: Types.ObjectId;

  @Prop({ required: true })
  repliedAt: Date;
}
export const ReviewReplySchema = SchemaFactory.createForClass(ReviewReply);

/**
 * A hotel review tied to one Completed reservation (HTL-23/24/26).
 * One review per reservation is enforced by the unique index on `bookingId`.
 */
@Schema({ timestamps: true, collection: 'reviews' })
export class Review {
  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  @Prop({
    type: Types.ObjectId,
    ref: 'HotelBooking',
    required: true,
    unique: true,
  })
  bookingId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ required: true, min: 1, max: 5 })
  rating: number;

  @Prop({ trim: true, maxlength: 1000, default: '' })
  comment: string;

  @Prop({ type: ReviewReplySchema, default: null })
  reply: ReviewReply | null;
}

export const ReviewSchema = SchemaFactory.createForClass(Review);
