import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { BlogPost } from './blog-post.schema.js';
import { User } from './user.schema.js';

@Schema({
    collection: 'comments',
    timestamps: true,
    strict: 'throw',
    minimize: true
})
export class Comment {
    @Prop({
        type: String,
        required: true,
        trim: true,
        minlength: 1,
        maxlength: 5000
    })
    text: string;

    @Prop({
        type: Types.ObjectId,
        ref: BlogPost.name,
        required: true,
        index: true
    })
    postId: Types.ObjectId;

    @Prop({
        type: Types.ObjectId,
        ref: User.name,
        required: true,
        index: true
    })
    userId: Types.ObjectId;
}

@Schema({
    collection: 'replies',
    timestamps: true,
    strict: 'throw',
    minimize: true,
    _id: true
})
export class Reply extends Comment {
    @Prop({
        type: Types.ObjectId,
        ref: 'Comment',
        required: true
    })
    commentId: Types.ObjectId;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
export type CommentDocument = HydratedDocument<Comment>;
export const ReplySchema = SchemaFactory.createForClass(Reply);
export type ReplyDocument = HydratedDocument<Reply>;
