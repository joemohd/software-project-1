import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { User } from '../../database/schemas/user.schema.js';

export enum AdminAction {
  RESET_PASSWORD = 'reset_password',
}

// GEN-07: record the action and participants, never passwords or tokens.
@Schema({ collection: 'audit_logs', timestamps: true, strict: 'throw' })
export class AuditLog {
  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  adminId: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: User.name, required: true, index: true })
  targetUserId: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(AdminAction), required: true })
  action: AdminAction;
}

export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
