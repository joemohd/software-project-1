import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { Itinerary } from './itinerary.schema.js';
import { Tag } from './tag.schema.js';
import { User } from './user.schema.js';

export enum PostStatus {
    PUBLISHED = 'published',
    DRAFT = 'draft'
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
        minlength: 1,
        maxlength: 100000
    })
    body: string;

    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true,
        index: true
    })
    userId: Types.ObjectId;

    @Prop({
        type: [Types.ObjectId],
        ref: Tag.name, default: []
    })
    tagIds: Types.ObjectId[];

    @Prop({
        type: [String],
        default: []
    })
    imageUrls: string[];

    @Prop({
        type: String,
        enum: Object.values(PostStatus),
        default: PostStatus.DRAFT,
        required: true
    })
    status: PostStatus;

    @Prop({
        type: Types.ObjectId,
        ref: Itinerary.name,
        index: true
    })
    itineraryId: Types.ObjectId;
}

export type BlogPostDocument = HydratedDocument<BlogPost>;
export const BlogPostSchema = SchemaFactory.createForClass(BlogPost);

BlogPostSchema.index({
    status: 1,
    createdAt: -1
});
