import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from './user.schema.js';

export enum ModeratedContentType {
    POST = 'post',
    COMMENT = 'comment',
    REVIEW = 'review',
    ITINERARY = 'itinerary'
}

export enum ReportStatus {
    OPEN = 'open',
    DISMISSED = 'dismissed',
    HIDDEN = 'hidden',
    DELETED = 'deleted'
}

export enum ReportResolution {
    DISMISS = 'dismiss',
    HIDE = 'hide',
    DELETE = 'delete'
}

// GEN-09, GEN-10: user reports on posts, comments, reviews or itineraries (at most one per user per item).
@Schema({
    collection: 'reports',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Report {
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true,
        index: true
    })
    reporterId: Types.ObjectId;

    @Prop({
        type: String,
        enum: Object.values(ModeratedContentType),
        required: true,
        index: true
    })
    targetType: ModeratedContentType;

    @Prop({
        type: Types.ObjectId,
        required: true,
        index: true
    })
    targetId: Types.ObjectId;

    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 1000
    })
    reason: string;

    @Prop({
        type: String,
        enum: Object.values(ReportStatus),
        default: ReportStatus.OPEN,
        required: true,
        index: true
    })
    status: ReportStatus;

    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        default: null
    })
    resolvedBy: Types.ObjectId | null;

    @Prop({
        type: Date,
        default: null
    })
    resolvedAt: Date | null;

    @Prop({
        type: String,
        trim: true,
        maxlength: 1000,
        default: null
    })
    resolutionNote: string | null;
}

export type ReportDocument = HydratedDocument<Report>;
export const ReportSchema = SchemaFactory.createForClass(Report);

// GEN-09: a registered user can report a post, comment, review or itinerary at most once per item
ReportSchema.index({ reporterId: 1, targetType: 1, targetId: 1 }, { unique: true });
ReportSchema.index({ status: 1, createdAt: -1, _id: -1 });
ReportSchema.index({ targetType: 1, targetId: 1, status: 1 });
