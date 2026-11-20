import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';
import { User } from './user.schema.js';

export enum AdminAction {
    RESET_PASSWORD = 'reset_password',
    SUSPEND_USER = 'suspend_user',
    REACTIVATE_USER = 'reactivate_user',
    DEACTIVATE_PROVIDER = 'deactivate_provider',
    REACTIVATE_PROVIDER = 'reactivate_provider',
    DISMISS_REPORT = 'dismiss_report',
    HIDE_CONTENT = 'hide_content',
    DELETE_CONTENT = 'delete_content'
}

export enum AuditTargetType {
    USER = 'user',
    AIRLINE = 'airline',
    HOTEL = 'hotel',
    REPORT = 'report',
    POST = 'post',
    COMMENT = 'comment',
    REVIEW = 'review',
    ITINERARY = 'itinerary'
}

// GEN-07: audit log of admin actions (suspensions, deletions, report resolutions, password resets).
@Schema({
    collection: 'audit_logs',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class AuditLog {
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true,
        index: true
    })
    adminId: Types.ObjectId;

    @Prop({
        type: String,
        enum: Object.values(AdminAction),
        required: true,
        index: true
    })
    action: AdminAction;

    @Prop({
        type: String,
        enum: Object.values(AuditTargetType),
        required: true,
        index: true
    })
    targetType: AuditTargetType;

    @Prop({
        type: Types.ObjectId,
        required: true,
        index: true
    })
    targetId: Types.ObjectId;

    @Prop({
        type: String,
        trim: true,
        maxlength: 1000,
        default: null
    })
    reason: string | null;

    @Prop({
        type: SchemaTypes.Mixed,
        default: {}
    })
    metadata: Record<string, unknown>;
}

export type AuditLogDocument = HydratedDocument<AuditLog>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);

AuditLogSchema.index({ createdAt: -1, _id: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ targetType: 1, targetId: 1, createdAt: -1 });
