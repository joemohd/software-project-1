import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { BlogPost, PostLike } from '../database/schemas/blog-post.schema.js';
import { User } from '../database/schemas/user.schema.js';
import { findPublicPost, toObjectIdOr404 } from './blog.helpers.js';
import type { LikeStatusDto } from './dto/post-response.dto.js';

/** MongoDB error code for a unique-index violation. */
const DUPLICATE_KEY = 11000;

/** BLG-06: a user likes a published post at most once and can remove the like. */
@Injectable()
export class LikesService {
  constructor(
    @InjectModel(PostLike.name) private readonly likeModel: Model<PostLike>,
    @InjectModel(BlogPost.name) private readonly postModel: Model<BlogPost>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
  ) {}

  async like(postId: string, userId: string): Promise<LikeStatusDto> {
    const post = await findPublicPost(this.postModel, this.userModel, postId);
    try {
      // The unique (userId, postId) index makes a second like fail even under concurrent requests
      await this.likeModel.create({
        postId: post._id,
        userId: new Types.ObjectId(userId),
      });
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY) {
        throw new ConflictException('You have already liked this post.');
      }
      throw error;
    }
    return { liked: true, likeCount: await this.count(post._id) };
  }

  async unlike(postId: string, userId: string): Promise<LikeStatusDto> {
    const id = toObjectIdOr404(postId, 'Post');
    const result = await this.likeModel
      .deleteOne({ postId: id, userId: new Types.ObjectId(userId) })
      .exec();
    if (result.deletedCount === 0) {
      throw new NotFoundException('You have not liked this post.');
    }
    return { liked: false, likeCount: await this.count(id) };
  }

  private count(postId: Types.ObjectId): Promise<number> {
    return this.likeModel.countDocuments({ postId }).exec();
  }
}
