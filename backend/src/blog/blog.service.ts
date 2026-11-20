import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { UploadService } from '../common/upload/upload.service.js';
import {
  BlogPost,
  PostLike,
  PostStatus,
  Tag,
} from '../database/schemas/blog-post.schema.js';
import { Comment } from '../database/schemas/comment.schema.js';
import { Itinerary } from '../database/schemas/itinerary.schema.js';
import { PAGE_SIZE, POST_MAX_IMAGES } from './blog.constants.js';
import {
  imageIdFromUrl,
  pageInfo,
  toImages,
  toObjectIdOr404,
} from './blog.helpers.js';
import type { CreatePostDto } from './dto/create-post.dto.js';
import type {
  MyPostsPageDto,
  PostResponseDto,
} from './dto/post-response.dto.js';
import type { UpdatePostDto } from './dto/update-post.dto.js';

/** A blog post read with .lean() and its tags populated with their names. */
type PostRecord = Omit<BlogPost, 'tagIds'> & {
  _id: Types.ObjectId;
  tagIds: { _id: Types.ObjectId; name: string }[];
  createdAt: Date;
  updatedAt: Date;
};

type CountRow = { _id: Types.ObjectId; count: number };

/** What the author does with their own posts: BLG-01, BLG-03, BLG-04, BLG-08, BLG-10, BLG-13. */
@Injectable()
export class BlogService {
  constructor(
    @InjectModel(BlogPost.name) private readonly postModel: Model<BlogPost>,
    @InjectModel(Tag.name) private readonly tagModel: Model<Tag>,
    @InjectModel(PostLike.name) private readonly likeModel: Model<PostLike>,
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(Itinerary.name)
    private readonly itineraryModel: Model<Itinerary>,
    private readonly uploadService: UploadService,
  ) {}

  // BLG-01: create a post as Draft (default) or Published
  async createPost(
    authorId: string,
    dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    const tagIds = await this.resolveTagIds(dto.tags ?? []);
    const created = await this.postModel.create({
      title: dto.title,
      body: dto.body,
      status: dto.status ?? PostStatus.DRAFT,
      tagIds,
      userId: new Types.ObjectId(authorId),
    });
    return this.getOwnPost(created._id.toString(), authorId);
  }

  // BLG-03: the author's own posts, drafts included, newest first
  async listMyPosts(authorId: string, page: number): Promise<MyPostsPageDto> {
    const filter = { userId: new Types.ObjectId(authorId) };
    const [total, posts] = await Promise.all([
      this.postModel.countDocuments(filter).exec(),
      this.postModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .populate('tagIds', 'name')
        .lean<PostRecord[]>()
        .exec(),
    ]);

    const postIds = posts.map((post) => post._id);
    const [likeCounts, commentCounts] = await Promise.all([
      this.countByPost(this.likeModel, postIds),
      this.countByPost(this.commentModel, postIds),
    ]);

    return {
      items: posts.map((post) => ({
        id: post._id.toString(),
        title: post.title,
        status: post.status,
        tags: post.tagIds.map((tag) => tag.name),
        likeCount: likeCounts.get(post._id.toString()) ?? 0,
        commentCount: commentCounts.get(post._id.toString()) ?? 0,
        createdAt: post.createdAt,
        updatedAt: post.updatedAt,
      })),
      ...pageInfo(page, total),
    };
  }

  // BLG-03, BLG-04: the author opens one of their own posts (drafts included) to edit it
  async getOwnPost(postId: string, authorId: string): Promise<PostResponseDto> {
    const id = toObjectIdOr404(postId, 'Post');
    const post = await this.postModel
      .findById(id)
      .populate('tagIds', 'name')
      .lean<PostRecord>()
      .exec();
    if (!post) throw new NotFoundException('Post not found.');
    if (post.userId.toString() !== authorId) {
      throw new ForbiddenException('You can only open your own posts here.');
    }
    return toPostResponse(post);
  }

  // BLG-04, BLG-08: the author edits their own post (title, body, tags, status)
  async updatePost(
    postId: string,
    authorId: string,
    dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    const post = await this.findOwnedPost(postId, authorId);

    if (dto.title !== undefined) post.title = dto.title;
    if (dto.body !== undefined) post.body = dto.body;
    if (dto.status !== undefined) post.status = dto.status;
    if (dto.tags !== undefined)
      post.tagIds = await this.resolveTagIds(dto.tags);

    await post.save();
    return this.getOwnPost(postId, authorId);
  }

  // BLG-04: the author deletes their own post; its likes and comments go with it
  async deletePost(postId: string, authorId: string): Promise<void> {
    const post = await this.findOwnedPost(postId, authorId);
    await Promise.all([
      this.likeModel.deleteMany({ postId: post._id }).exec(),
      this.commentModel.deleteMany({ postId: post._id }).exec(),
    ]);
    await post.deleteOne();
  }

  // BLG-10, GEN-08: attach one JPG/PNG image (max 5 MB, max 5 per post)
  async addImage(
    postId: string,
    authorId: string,
    file: Express.Multer.File,
  ): Promise<PostResponseDto> {
    const post = await this.findOwnedPost(postId, authorId);
    // Checked before uploading so a full post doesn't leave an unused file in storage
    if (post.imageUrls.length >= POST_MAX_IMAGES) {
      throw new BadRequestException(
        `A post can have at most ${POST_MAX_IMAGES} images.`,
      );
    }

    const { url } = await this.uploadService.uploadImage(file);
    post.imageUrls = [...post.imageUrls, url];
    await post.save();
    return this.getOwnPost(postId, authorId);
  }

  // BLG-10: remove an image from the post
  async removeImage(
    postId: string,
    authorId: string,
    imageId: string,
  ): Promise<PostResponseDto> {
    const post = await this.findOwnedPost(postId, authorId);
    const remaining = post.imageUrls.filter(
      (url) => imageIdFromUrl(url) !== imageId,
    );
    if (remaining.length === post.imageUrls.length) {
      throw new NotFoundException('Image not found on this post.');
    }

    post.imageUrls = remaining;
    await post.save();
    return this.getOwnPost(postId, authorId);
  }

  // BLG-13: attach one of the author's own itineraries, or detach it with null
  async attachItinerary(
    postId: string,
    authorId: string,
    itineraryId: string | null,
  ): Promise<PostResponseDto> {
    const post = await this.findOwnedPost(postId, authorId);

    if (itineraryId === null) {
      post.set('itineraryId', undefined);
    } else {
      const itinerary = await this.itineraryModel
        .findOne({
          _id: new Types.ObjectId(itineraryId),
          userId: new Types.ObjectId(authorId),
        })
        .select('_id')
        .lean<{ _id: Types.ObjectId }>()
        .exec();
      // Another user's itinerary answers 404 too, so private itineraries are not revealed
      if (!itinerary) throw new NotFoundException('Itinerary not found.');
      post.itineraryId = itinerary._id;
    }

    await post.save();
    return this.getOwnPost(postId, authorId);
  }

  /** Loads a post for writing; 404 if it doesn't exist, 403 if the caller isn't its author. */
  private async findOwnedPost(postId: string, authorId: string) {
    const id = toObjectIdOr404(postId, 'Post');
    const post = await this.postModel.findById(id).exec();
    if (!post) throw new NotFoundException('Post not found.');
    if (post.userId.toString() !== authorId) {
      throw new ForbiddenException('You can only change your own posts.');
    }
    return post;
  }

  /**
   * BLG-08: turns tag names into Tag ids, creating tags that don't exist yet.
   * Names are lowercased and de-duplicated, and the order the author gave is kept.
   */
  private async resolveTagIds(rawNames: string[]): Promise<Types.ObjectId[]> {
    const names = [
      ...new Set(rawNames.map((name) => name.trim().toLowerCase())),
    ];
    if (names.length === 0) return [];

    await this.tagModel.bulkWrite(
      names.map((name) => ({
        updateOne: {
          filter: { name },
          update: { $setOnInsert: { name } },
          upsert: true,
        },
      })),
    );
    const tags = await this.tagModel
      .find({ name: { $in: names } })
      .lean<{ _id: Types.ObjectId; name: string }[]>()
      .exec();
    const idByName = new Map(tags.map((tag) => [tag.name, tag._id]));
    return names.map((name) => idByName.get(name)!);
  }

  /** Counts likes or comments per post in one query. */
  private async countByPost(
    model: Model<PostLike> | Model<Comment>,
    postIds: Types.ObjectId[],
  ): Promise<Map<string, number>> {
    if (postIds.length === 0) return new Map();
    const rows = await (model as Model<PostLike>)
      .aggregate<CountRow>([
        { $match: { postId: { $in: postIds } } },
        { $group: { _id: '$postId', count: { $sum: 1 } } },
      ])
      .exec();
    return new Map(rows.map((row) => [row._id.toString(), row.count]));
  }
}

function toPostResponse(post: PostRecord): PostResponseDto {
  return {
    id: post._id.toString(),
    title: post.title,
    body: post.body,
    status: post.status,
    tags: post.tagIds.map((tag) => tag.name),
    images: toImages(post.imageUrls),
    authorId: post.userId.toString(),
    itineraryId: post.itineraryId ? post.itineraryId.toString() : null,
    createdAt: post.createdAt,
    updatedAt: post.updatedAt,
  };
}
