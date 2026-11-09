import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BlogPost } from './blog-post.schema.js';
import { Comment } from './comment.schema.js';

@Schema({
    collection: 'post_comments',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class PostComment {
    @Prop({
        type: Types.ObjectId,
        ref: BlogPost.name,
        required: true,
        index: true
    })
    postId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: Comment.name,
        required: true
    })
    commentId: Types.ObjectId;
}

export type PostCommentDocument = HydratedDocument<PostComment>;
export const PostCommentSchema = SchemaFactory.createForClass(PostComment);

PostCommentSchema.index(
    { postId: 1, commentId: 1 },
    { unique: true }
);
