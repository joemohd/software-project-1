import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Country } from './country.schema.js';

export enum UserActivityStatus {
    NEW = 'new',
    ACTIVE = 'active',
    INACTIVE = 'inactive',
    SUSPENDED = 'suspended'
}

export enum UserRole {
    USER = 'user',
    ADMIN = 'admin',
    MODERATOR = 'moderator'
}

@Schema({
    collection: 'users',
    timestamps: true,
    strict: true,
    minimize: true
})
export class User {
    @Prop({
        type: String,
        required: true,
        trim: true
    })
    fullName: string;

    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    })
    emailAddress: string;

    @Prop({ type: String })
    passwordHash: string;
    // hashed by the service using argon2

    @Prop({ type: String })
    phoneNumber: string;
    // transoformation of phone numbers into a format ITU-T E.164 standard should be handled by the backend server not the database

    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true
    })
    username: string;

    @Prop({
        type: String
    })
    profileImageUrl: string;

    @Prop({
        type: String,
        enum: Object.values(UserRole),
        default: UserRole.USER,
        required: true
    })
    role: UserRole;

    @Prop({
        type: Types.ObjectId,
        ref: Country.name,
        required: true
    })
    countryOfOrigin: Types.ObjectId;
    // enforce referential integrity

    @Prop({
        type: Number,
        default: 0,
        min: 0,
        max: 5
    })
    loginAttempts: number;

    @Prop({
        type: Date,
        default: null
    })
    loginAttemptsResetAt: Date | null;

    @Prop({
        type: String,
        enum: Object.values(UserActivityStatus),
        default: UserActivityStatus.ACTIVE,
        required: true
    })
    status: UserActivityStatus;

    @Prop({
        type: Boolean,
        required: true,
        default: false
    })
    isVerified: boolean;
}

export type UserDocument = HydratedDocument<User>;

export const UserSchema = SchemaFactory.createForClass(User);

@Schema({
    collection: 'moderators',
    timestamps: true,
    strict: true,
    minimize: true
})
export class Moderator extends User {
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true
    })
    adminId: Types.ObjectId;
}

export const ModeratorSchema = SchemaFactory.createForClass(Moderator);
