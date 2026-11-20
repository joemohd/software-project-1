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

    // TODO: Perform referential integrity checks in the backend application
    @Prop({
        type: Types.ObjectId,
        ref: BlogPost.name,
        required: true,
        index: true
    })
    postId: Types.ObjectId;

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
        type: Types.ObjectId,
        ref: Comment.name,
        default: null,
        index: true
    })
    parentCommentId: Types.ObjectId | null;

    // GEN-10: hidden comments stay visible only to their author and admins
    @Prop({
        type: Boolean,
        default: false
    })
    isHidden?: boolean;
}

export const CommentSchema = SchemaFactory.createForClass(Comment);
export type CommentDocument = HydratedDocument<Comment>;

CommentSchema.index({
    postId: 1,
    createdAt: -1
});

CommentSchema.index({
    postId: 1,
    parentCommentId: 1,
    createdAt: -1
});
