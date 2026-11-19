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
    FLIGHT_MODERATOR = 'flight moderator',
    HOTEL_MODERATOR = 'hotel moderator'
}

@Schema({
    collection: 'users',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class User {
    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 100
    })
    fullName: string;

    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        maxlength: 254,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    })
    emailAddress: string;

    @Prop({
        type: String,
        select: false
    })
    passwordHash: string;

    @Prop({
        type: String,
        trim: true,
        maxlength: 16,
        match: /^\+[1-9]\d{1,14}$/
    })
    phoneNumber: string;
    // transoformation of phone numbers into a format ITU-T E.164 standard should be handled by the backend server not the database

    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 3,
        maxlength: 30,
        match: /^[a-z0-9._]+$/
    })
    username: string;

    // TODO: Enforce security measures later to make sure that the image URL only comes from our account on whatever cloud storage service we will use
    @Prop({
        type: String,
        default: "", // we should upload a default pfp for users
        validate: [{
            validator: (value: string) => {
                if (!value) return true;

                try {
                    const parsed = new URL(value);
                    return ['http:', 'https:'].includes(parsed.protocol);
                } catch {
                    return false;
                }
            },
            message: 'Invalid image URL.'
        }]
    })
    profileImageUrl: string;

    @Prop({
        type: String,
        enum: Object.values(UserRole),
        default: UserRole.USER,
        required: true
    })
    role: UserRole;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Country.name,
        required: true,
        index: true
    })
    countryOfOriginId: Types.ObjectId;

    @Prop({
        type: Number,
        default: 0,
        min: 0,
        max: 5,
        validate: {
            validator: Number.isInteger,
            message: 'Login attempts must be an integer.'
        }
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

    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: function (this: User) {
            return this.role === UserRole.FLIGHT_MODERATOR || this.role === UserRole.HOTEL_MODERATOR;
        }
    })
    adminId?: Types.ObjectId;
}

export type UserDocument = HydratedDocument<User>;
export const UserSchema = SchemaFactory.createForClass(User);
