import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from './user.schema.js';

export enum NotificationType {
  BOOKING_CONFIRMED = 'booking_confirmed',
  BOOKING_CANCELLED = 'booking_cancelled',
  REFUND_ISSUED = 'refund_issued',
  FLIGHT_SCHEDULE_CHANGED = 'flight_schedule_changed',
  FLIGHT_CANCELLED = 'flight_cancelled',
  ACCOUNT_SUSPENDED = 'account_suspended',
  ACCOUNT_REACTIVATED = 'account_reactivated',
  PROVIDER_DEACTIVATED = 'provider_deactivated',
  PROVIDER_REACTIVATED = 'provider_reactivated',
}

// GEN-01, GEN-01-B: in-app notifications (unread count, notification list, mark as read), paired with SMTP emails.
@Schema({
  collection: 'notifications',
  timestamps: true,
  strict: 'throw',
  minimize: false,
})
export class Notification {
  @Prop({
    type: Types.ObjectId,
    ref: User.name,
    required: true,
    index: true,
  })
  userId: Types.ObjectId;

  @Prop({
    type: String,
    enum: Object.values(NotificationType),
    required: true,
    index: true,
  })
  type: NotificationType;

  @Prop({
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 200,
  })
  title: string;

  @Prop({
    type: String,
    required: true,
    trim: true,
    minlength: 1,
    maxlength: 2000,
  })
  message: string;

  @Prop({
    type: Boolean,
    default: false,
    required: true,
    index: true,
  })
  isRead: boolean;

  @Prop({
    type: Date,
    default: null,
  })
  readAt: Date | null;

  @Prop({
    type: Object,
    default: {},
  })
  metadata: Record<string, unknown>;
}

export type NotificationDocument = HydratedDocument<Notification>;
export const NotificationSchema = SchemaFactory.createForClass(Notification);

NotificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, createdAt: -1, _id: -1 });
