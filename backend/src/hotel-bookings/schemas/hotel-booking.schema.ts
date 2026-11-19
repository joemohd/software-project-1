import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { HotelBookingStatus } from '../../common/enums/hotel-booking-status.enum.js';

export type HotelBookingDocument = HydratedDocument<HotelBooking>;

/** One room line inside a reservation (HTL-16). */
@Schema({ _id: false })
export class BookedRoom {
  @Prop({ type: Types.ObjectId, ref: 'Room', required: true })
  roomId: Types.ObjectId;

  @Prop({ required: true })
  roomNumber: string;

  @Prop({ required: true })
  type: string;

  /** Price per night captured at booking time — later price changes do not
   *  affect existing reservations (HTL-05). */
  @Prop({ required: true, min: 0 })
  pricePerNight: number;

  @Prop({ required: true, min: 1 })
  adults: number;

  /** Children's ages (0–17). Length = number of children (HTL-16). */
  @Prop({ type: [Number], default: [] })
  childrenAges: number[];
}
export const BookedRoomSchema = SchemaFactory.createForClass(BookedRoom);

@Schema({ _id: false })
export class PolicyAcceptance {
  @Prop({ default: false })
  accepted: boolean;

  @Prop()
  acceptedAt: Date;
}
export const PolicyAcceptanceSchema =
  SchemaFactory.createForClass(PolicyAcceptance);

/** Minimal payment snapshot — only non-sensitive fields are stored (PAY-01). */
@Schema({ _id: false })
export class PaymentInfo {
  @Prop()
  stripePaymentId: string;

  @Prop()
  amount: number;

  @Prop()
  currency: string;

  @Prop()
  status: string;
}
export const PaymentInfoSchema = SchemaFactory.createForClass(PaymentInfo);

/** Cancellation + refund snapshot (HTL-21 / PAY-03). */
@Schema({ _id: false })
export class CancellationInfo {
  @Prop()
  cancelledAt: Date;

  @Prop()
  refundPercent: number;

  @Prop()
  refundAmount: number;

  @Prop({ default: 'Pending' })
  refundStatus: string; // Pending | Refunded | Failed

  @Prop({ type: Types.ObjectId, ref: 'Refund' })
  refundId: Types.ObjectId;
}
export const CancellationInfoSchema =
  SchemaFactory.createForClass(CancellationInfo);

/**
 * A hotel reservation (HTL-16/17/18). SHARED SCHEMA — owned by the
 * Hotel-booking teammate. If they already define it, delete this file and
 * import theirs. The listing / cancel / review endpoints read & update these
 * fields; make sure the field names agree.
 */
@Schema({ timestamps: true, collection: 'hotelbookings' })
export class HotelBooking {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, index: true })
  userId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  /** Unique human-readable reference, set once the booking is Confirmed (HTL-17). */
  @Prop({ unique: true, sparse: true })
  reference: string;

  @Prop({ type: [BookedRoomSchema], required: true })
  rooms: BookedRoom[];

  @Prop({ required: true })
  checkIn: Date;

  @Prop({ required: true })
  checkOut: Date;

  @Prop({ required: true, min: 1 })
  nights: number;

  @Prop({ required: true, min: 0 })
  totalPrice: number;

  @Prop({
    type: String,
    enum: Object.values(HotelBookingStatus),
    default: HotelBookingStatus.PENDING_PAYMENT,
    index: true,
  })
  status: HotelBookingStatus;

  /** For PENDING_PAYMENT holds — when the 10-minute hold expires (HTL-18). */
  @Prop()
  holdExpiresAt: Date;

  @Prop({ type: PolicyAcceptanceSchema, default: () => ({}) })
  policyAcceptance: PolicyAcceptance;

  @Prop({ type: PaymentInfoSchema })
  payment: PaymentInfo;

  @Prop({ type: CancellationInfoSchema })
  cancellation: CancellationInfo;

  /** Set when the user leaves a review (HTL-23); enforces one review per booking. */
  @Prop({ type: Types.ObjectId, ref: 'Review' })
  reviewId: Types.ObjectId;
}

export const HotelBookingSchema = SchemaFactory.createForClass(HotelBooking);
