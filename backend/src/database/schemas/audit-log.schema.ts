import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

@Schema({ _id: false })
export class AuditField {
    @Prop({
        type: String,
        required: true
    })
    key: string;

    @Prop({
        type: SchemaTypes.Mixed,
        required: true
    })
    value: unknown;
}

@Schema({ _id: false })
export class AuditRecord {
    @Prop({
        types: String,
        required: true
    })
    name: string;

    @Prop({
        type: [AuditField],
        default: []
    })
    fields: AuditField[];
}

export class AuditLog {
    actorId: Types.ObjectId | 'system';
    ipAddress: string;
    action: string;
    resourceType: string;
    resourceId: Types.ObjectId;
    records: AuditRecord[];
    metadata: AuditField[];
}

export const AuditValueSchema = SchemaFactory.createForClass(AuditField);
export type AuditValueDocument = HydratedDocument<AuditField>;
export const AuditRecordSchema = SchemaFactory.createForClass(AuditRecord);
export type AuditRecordDocument = HydratedDocument<AuditRecord>;
export const AuditLogSchema = SchemaFactory.createForClass(AuditLog);
export type AuditLogDocument = HydratedDocument<AuditLog>;
