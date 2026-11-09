import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { User } from './user.schema.js';
import { BlogPost } from './blog-post.schema.js';

@Schema({
    collection: 'post_likes',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class PostLike {
    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true
    })
    userId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: BlogPost.name,
        required: true
    })
    postId: Types.ObjectId;
}

export type PostLikeDocument = HydratedDocument<PostLike>;
export const PostLikeSchema = SchemaFactory.createForClass(PostLike);

PostLikeSchema.index(
    { userId: 1, postId: 1 },
    { unique: true }
);
