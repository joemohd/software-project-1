import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BlogPost } from '../database/schemas/blog-post.schema.js';
import { Comment } from '../database/schemas/comment.schema.js';
import { User, UserActivityStatus } from '../database/schemas/user.schema.js';
import { PAGE_SIZE } from './blog.constants.js';
import {
  DELETED_USER_NAME,
  findPublicPost,
  pageInfo,
  toObjectIdOr404,
} from './blog.helpers.js';
import type {
  CommentResponseDto,
  CommentsPageDto,
} from './dto/post-response.dto.js';

/** A comment read with .lean() and its author populated. */
type CommentRecord = {
  _id: Types.ObjectId;
  postId: Types.ObjectId;
  text: string;
  userId: {
    _id: Types.ObjectId;
    fullName: string;
    status: UserActivityStatus;
  } | null;
  createdAt: Date;
  updatedAt: Date;
};

/** BLG-05, BLG-07: comments on published posts. */
@Injectable()
export class CommentsService {
  constructor(
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(BlogPost.name) private readonly postModel: Model<BlogPost>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  // BLG-05: comment on a published post (1 to 500 characters)
  async addComment(
    postId: string,
    userId: string,
    text: string,
  ): Promise<CommentResponseDto> {
    const post = await findPublicPost(this.postModel, this.userModel, postId);
    const created = await this.commentModel.create({
      postId: post._id,
      userId: new Types.ObjectId(userId),
      text,
    });
    return this.getComment(created._id);
  }

  // BLG-02, BLG-05: a page of a post's comments, oldest first
  async listForPost(
    postId: Types.ObjectId,
    page: number,
  ): Promise<CommentsPageDto> {
    const filter = { postId };
    const [total, comments] = await Promise.all([
      this.commentModel.countDocuments(filter).exec(),
      this.commentModel
        .find(filter)
        .sort({ createdAt: 1, _id: 1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate('userId', 'fullName status')
        .lean<CommentRecord[]>()
        .exec(),
    ]);
    return { items: comments.map(toCommentResponse), ...pageInfo(page, total) };
  }

  // BLG-07: edit your own comment
  async updateComment(
    commentId: string,
    userId: string,
    text: string,
  ): Promise<CommentResponseDto> {
    const comment = await this.findOwnedComment(commentId, userId);
    comment.text = text;
    await comment.save();
    return this.getComment(comment._id);
  }

  // BLG-07: delete your own comment
  async deleteComment(commentId: string, userId: string): Promise<void> {
    const comment = await this.findOwnedComment(commentId, userId);
    await comment.deleteOne();
  }

  /** 404 if the comment doesn't exist, 403 if the caller didn't write it. */
  private async findOwnedComment(commentId: string, userId: string) {
    const id = toObjectIdOr404(commentId, 'Comment');
    const comment = await this.commentModel.findById(id).exec();
    if (!comment) throw new NotFoundException('Comment not found.');
    if (comment.userId.toString() !== userId) {
      throw new ForbiddenException('You can only change your own comments.');
    }
    return comment;
  }

  private async getComment(id: Types.ObjectId): Promise<CommentResponseDto> {
    const comment = await this.commentModel
      .findById(id)
      .populate('userId', 'fullName status')
      .lean<CommentRecord>()
      .exec();
    if (!comment) throw new NotFoundException('Comment not found.');
    return toCommentResponse(comment);
  }
}

function toCommentResponse(comment: CommentRecord): CommentResponseDto {
  // ACC-12: a deactivated author's comments stay but show as "Deleted user"
  const author = comment.userId;
  const deleted = !author || author.status === UserActivityStatus.INACTIVE;
  return {
    id: comment._id.toString(),
    postId: comment.postId.toString(),
    text: comment.text,
    author: deleted
      ? { id: null, name: DELETED_USER_NAME }
      : { id: author._id.toString(), name: author.fullName },
    createdAt: comment.createdAt,
    updatedAt: comment.updatedAt,
  };
}
