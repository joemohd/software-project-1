import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Itinerary } from './itinerary.schema.js';
import { User } from './user.schema.js';

export enum PostStatus {
    PUBLISHED = 'published',
    DRAFT = 'draft',
    ARCHIVED = 'archived'
}

@Schema({
    collection: 'tags',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Tag {
    @Prop({
        type: String,
        required: true,
        unique: true,
        trim: true,
        lowercase: true,
        minlength: 1,
        maxlength: 30
    })
    name: string;
}

@Schema({
    collection: 'blog_posts',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class BlogPost {
    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 200
    })
    title: string;

    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1
    })
    body: string;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true,
        index: true
    })
    userId: Types.ObjectId;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: [Types.ObjectId],
        ref: Tag.name,
        default: [],
        validate: [
            {
                validator: (value: Types.ObjectId[]) => value.length <= 5,
                message: 'A post cannot have more than 5 tags.'
            },
            {
                validator: (value: Types.ObjectId[]) => new Set(value.map(id => id.toString())).size === value.length,
                message: 'Duplicate tags are not allowed.'
            }
        ]
    })
    tagIds: Types.ObjectId[];

    // TODO: Enforce security measures later to make sure that the image URLs only come from our account on whatever cloud storage service we will use
    @Prop({
        type: [String],
        default: [],
        validate: [
            {
                validator: (value: string[]) => value.length <= 5,
                message: 'A blog post cannot have more than 5 images.'
            },
            {
                validator: (value: string[]) =>
                    value.every(url => {
                        try {
                            const parsed = new URL(url);
                            return ['http:', 'https:'].includes(parsed.protocol);
                        } catch {
                            return false;
                        }
                    }),
                message: 'Invalid image URL.'
            },
            {
                validator: (value: string[]) =>
                    new Set(value).size === value.length,
                message: 'Duplicate image URLs are not allowed.'
            }
        ]
    })
    imageUrls: string[];

    @Prop({
        type: String,
        enum: Object.values(PostStatus),
        default: PostStatus.DRAFT,
        required: true
    })
    status: PostStatus;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: Itinerary.name,
        index: true
    })
    itineraryId: Types.ObjectId;
}

@Schema({
    collection: 'post_likes',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class PostLike {
    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true
    })
    userId: Types.ObjectId;

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: BlogPost.name,
        required: true
    })
    postId: Types.ObjectId;
}

export type BlogPostDocument = HydratedDocument<BlogPost>;
export type TagDocument = HydratedDocument<Tag>;
export type PostLikeDocument = HydratedDocument<PostLike>;
export const PostLikeSchema = SchemaFactory.createForClass(PostLike);
export const TagSchema = SchemaFactory.createForClass(Tag);
export const BlogPostSchema = SchemaFactory.createForClass(BlogPost);

BlogPostSchema.index(
    { status: 1, createdAt: -1 }
);

PostLikeSchema.index(
    { userId: 1, postId: 1 },
    { unique: true }
);

PostLikeSchema.index({ postId: 1 });
