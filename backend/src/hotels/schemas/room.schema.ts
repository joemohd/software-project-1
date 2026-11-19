import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type RoomDocument = HydratedDocument<Room>;

/** A date range, stored as UTC midnight dates (date-only semantics). */
@Schema({ _id: false })
export class DateRange {
  @Prop({ required: true })
  start: Date;

  @Prop({ required: true })
  end: Date;
}
export const DateRangeSchema = SchemaFactory.createForClass(DateRange);

/**
 * An individually bookable room (HTL-03). SHARED SCHEMA — owned by the
 * Hotels-CRUD teammate (HTL-03/04/05/06). If they already define it, delete
 * this file and import theirs. The search/availability code only reads these
 * fields.
 *
 *  - `availability` : non-overlapping ranges in which the room is bookable (HTL-04)
 *  - `blockedRanges`: ranges blocked by the moderator (HTL-06)
 *  - `active`       : deactivated rooms are excluded from search (HTL-06)
 */
@Schema({ timestamps: true, collection: 'rooms' })
export class Room {
  @Prop({ type: Types.ObjectId, ref: 'Hotel', required: true, index: true })
  hotelId: Types.ObjectId;

  @Prop({ required: true, trim: true })
  roomNumber: string;

  @Prop({ required: true, trim: true })
  type: string;

  @Prop({ required: true, min: 1 })
  beds: number;

  @Prop({ required: true, min: 1 })
  maxOccupancy: number;

  @Prop({ required: true, min: 0.01 })
  pricePerNight: number;

  @Prop({ type: [DateRangeSchema], default: [] })
  availability: DateRange[];

  @Prop({ type: [DateRangeSchema], default: [] })
  blockedRanges: DateRange[];

  @Prop({ default: true })
  active: boolean;
}

export const RoomSchema = SchemaFactory.createForClass(Room);
