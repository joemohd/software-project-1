import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import {
  BlogPost,
  PostLike,
  PostStatus,
  Tag,
} from '../database/schemas/blog-post.schema.js';
import { Comment } from '../database/schemas/comment.schema.js';
import {
  Itinerary,
  ItineraryVisibility,
} from '../database/schemas/itinerary.schema.js';
import { User, UserActivityStatus } from '../database/schemas/user.schema.js';
import { PAGE_SIZE } from './blog.constants.js';
import {
  escapeRegex,
  excerpt,
  findPublicPost,
  pageInfo,
  toImages,
  toObjectIdOr404,
} from './blog.helpers.js';
import { CommentsService } from './comments.service.js';
import type {
  AuthorPageDto,
  PublicPostDto,
  PublicPostsPageDto,
  PublicPostSummaryDto,
} from './dto/post-response.dto.js';

export interface ListPublishedOptions {
  page: number;
  q?: string; // BLG-09 keyword
  tag?: string; // BLG-02, BLG-08 tag filter
  authorId?: Types.ObjectId; // BLG-12 author page
}

type AggregatedPost = {
  _id: Types.ObjectId;
  title: string;
  body: string;
  createdAt: Date;
  tags: { name: string }[];
  author: { _id: Types.ObjectId; fullName: string };
  likeCount: number;
  commentCount: number;
};

/** What guests can read: BLG-02, BLG-08, BLG-09, BLG-12. */
@Injectable()
export class PublicBlogService {
  constructor(
    @InjectModel(BlogPost.name) private readonly postModel: Model<BlogPost>,
    @InjectModel(Tag.name) private readonly tagModel: Model<Tag>,
    @InjectModel(PostLike.name) private readonly likeModel: Model<PostLike>,
    @InjectModel(Comment.name) private readonly commentModel: Model<Comment>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Itinerary.name)
    private readonly itineraryModel: Model<Itinerary>,
    private readonly commentsService: CommentsService,
  ) {}

  /**
   * BLG-02, BLG-08, BLG-09: published posts, 10 per page.
   * Only Published posts by authors who haven't deactivated their account are listed (ACC-12);
   * Archived posts are hidden ones (GEN-10) and never appear.
   * With a keyword the results are ordered by likes + comments, newest first on ties (BLG-09);
   * without one the newest posts come first.
   */
  async listPublished(
    options: ListPublishedOptions,
  ): Promise<PublicPostsPageDto> {
    const match: Record<string, unknown> = { status: PostStatus.PUBLISHED };
    if (options.authorId) match.userId = options.authorId;

    if (options.tag) {
      const tag = await this.tagModel
        .findOne({ name: options.tag.toLowerCase() })
        .select('_id')
        .lean<{ _id: Types.ObjectId }>()
        .exec();
      if (!tag) return { items: [], ...pageInfo(options.page, 0) };
      match.tagIds = tag._id;
    }

    const pipeline: PipelineStage[] = [
      { $match: match },
      {
        $lookup: {
          from: this.userModel.collection.name,
          localField: 'userId',
          foreignField: '_id',
          as: 'author',
          pipeline: [{ $project: { fullName: 1, status: 1 } }],
        },
      },
      { $unwind: '$author' },
      { $match: { 'author.status': { $ne: UserActivityStatus.INACTIVE } } },
      {
        $lookup: {
          from: this.tagModel.collection.name,
          localField: 'tagIds',
          foreignField: '_id',
          as: 'tags',
          pipeline: [{ $project: { name: 1 } }],
        },
      },
    ];

    if (options.q) {
      const keyword = new RegExp(escapeRegex(options.q), 'i');
      pipeline.push({
        $match: {
          $or: [
            { title: keyword },
            { 'tags.name': keyword },
            { 'author.fullName': keyword },
          ],
        },
      });
    }

    pipeline.push(
      {
        $lookup: {
          from: this.likeModel.collection.name,
          localField: '_id',
          foreignField: 'postId',
          as: 'likeStats',
          pipeline: [{ $count: 'n' }],
        },
      },
      {
        $lookup: {
          from: this.commentModel.collection.name,
          localField: '_id',
          foreignField: 'postId',
          as: 'commentStats',
          pipeline: [{ $count: 'n' }],
        },
      },
      {
        $addFields: {
          likeCount: { $ifNull: [{ $first: '$likeStats.n' }, 0] },
          commentCount: { $ifNull: [{ $first: '$commentStats.n' }, 0] },
        },
      },
      // BLG-09 interaction score
      { $addFields: { score: { $add: ['$likeCount', '$commentCount'] } } },
      {
        $sort: options.q
          ? { score: -1, createdAt: -1, _id: -1 }
          : { createdAt: -1, _id: -1 },
      },
      {
        $facet: {
          items: [
            { $skip: (options.page - 1) * PAGE_SIZE },
            { $limit: PAGE_SIZE },
          ],
          total: [{ $count: 'n' }],
        },
      },
    );

    const [result] = await this.postModel
      .aggregate<{ items: AggregatedPost[]; total: { n: number }[] }>(pipeline)
      .exec();
    const total = result?.total[0]?.n ?? 0;

    return {
      items: (result?.items ?? []).map(toPublicSummary),
      ...pageInfo(options.page, total),
    };
  }

  // BLG-02, BLG-13: the public post page with its like count, comments and public itinerary
  async getPublicPost(
    postId: string,
    commentsPage: number,
  ): Promise<PublicPostDto> {
    const post = await findPublicPost(this.postModel, this.userModel, postId);

    const [author, tags, likeCount, comments, itinerary] = await Promise.all([
      this.userModel
        .findById(post.userId)
        .select('fullName')
        .lean<{ _id: Types.ObjectId; fullName: string }>()
        .exec(),
      this.tagModel
        .find({ _id: { $in: post.tagIds } })
        .select('name')
        .lean<{ _id: Types.ObjectId; name: string }[]>()
        .exec(),
      this.likeModel.countDocuments({ postId: post._id }).exec(),
      this.commentsService.listForPost(post._id, commentsPage),
      post.itineraryId
        ? this.itineraryModel
            .findOne({
              _id: post.itineraryId,
              visibility: ItineraryVisibility.PUBLIC,
            })
            .select('title startDate')
            .lean<{ _id: Types.ObjectId; title: string; startDate: Date }>()
            .exec()
        : null,
    ]);

    // Keep the order the author gave the tags in
    const nameById = new Map(tags.map((tag) => [tag._id.toString(), tag.name]));
    const timestamps = post as unknown as { createdAt: Date; updatedAt: Date };

    return {
      id: post._id.toString(),
      title: post.title,
      body: post.body,
      tags: post.tagIds
        .map((id) => nameById.get(id.toString()))
        .filter((name): name is string => !!name),
      images: toImages(post.imageUrls),
      author: { id: post.userId.toString(), name: author?.fullName ?? '' },
      createdAt: timestamps.createdAt,
      updatedAt: timestamps.updatedAt,
      likeCount,
      comments,
      itinerary: itinerary
        ? {
            id: itinerary._id.toString(),
            title: itinerary.title,
            startDate: itinerary.startDate,
          }
        : null,
    };
  }

  // BLG-12: public author page with name, join date, published posts and public itineraries
  async getAuthorPage(
    authorId: string,
    postsPage: number,
    itinerariesPage: number,
  ): Promise<AuthorPageDto> {
    const id = toObjectIdOr404(authorId, 'Author');
    const author = await this.userModel
      .findById(id)
      .select('fullName username status createdAt')
      .lean<{
        _id: Types.ObjectId;
        fullName: string;
        username: string;
        status: UserActivityStatus;
        createdAt: Date;
      }>()
      .exec();
    // ACC-12: a deactivated author's page is gone along with their posts
    if (!author || author.status === UserActivityStatus.INACTIVE) {
      throw new NotFoundException('Author not found.');
    }

    const itineraryFilter = {
      userId: id,
      visibility: ItineraryVisibility.PUBLIC,
    };
    const [posts, itineraryTotal, itineraries] = await Promise.all([
      this.listPublished({ page: postsPage, authorId: id }),
      this.itineraryModel.countDocuments(itineraryFilter).exec(),
      this.itineraryModel
        .find(itineraryFilter)
        .sort({ updatedAt: -1 })
        .skip((itinerariesPage - 1) * PAGE_SIZE)
        .limit(PAGE_SIZE)
        .select('title startDate days')
        .lean<
          {
            _id: Types.ObjectId;
            title: string;
            startDate: Date;
            days: unknown[];
          }[]
        >()
        .exec(),
    ]);

    return {
      id: author._id.toString(),
      name: author.fullName,
      username: author.username,
      joinedAt: author.createdAt,
      posts,
      itineraries: {
        items: itineraries.map((itinerary) => ({
          id: itinerary._id.toString(),
          title: itinerary.title,
          startDate: itinerary.startDate,
          dayCount: itinerary.days?.length ?? 0,
        })),
        ...pageInfo(itinerariesPage, itineraryTotal),
      },
    };
  }
}

function toPublicSummary(post: AggregatedPost): PublicPostSummaryDto {
  return {
    id: post._id.toString(),
    title: post.title,
    excerpt: excerpt(post.body),
    tags: post.tags.map((tag) => tag.name),
    author: { id: post.author._id.toString(), name: post.author.fullName },
    likeCount: post.likeCount,
    commentCount: post.commentCount,
    createdAt: post.createdAt,
  };
}
