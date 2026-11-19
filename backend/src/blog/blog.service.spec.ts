import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Types } from 'mongoose';
import { PostStatus } from '../database/schemas/blog-post.schema.js';
import { UserActivityStatus } from '../database/schemas/user.schema.js';
import { escapeRegex, excerpt, imageIdFromUrl } from './blog.helpers.js';
import { BlogService } from './blog.service.js';
import { CommentsService } from './comments.service.js';
import { LikesService } from './likes.service.js';

const authorId = new Types.ObjectId();
const otherUserId = new Types.ObjectId();
const postId = new Types.ObjectId();
const commentId = new Types.ObjectId();
const itineraryId = new Types.ObjectId();
const egyptTagId = new Types.ObjectId();
const imageUrl = (name: string) =>
  `https://res.cloudinary.com/demo/image/upload/v1/travel-booking/images/${name}.jpg`;

type MockModel = Record<string, ReturnType<typeof vi.fn>>;

/** Mimics a mongoose query: chainable helpers, resolved by exec(). */
const query = (result: unknown) => {
  const q: MockModel = { exec: vi.fn().mockResolvedValue(result) };
  for (const method of [
    'sort',
    'skip',
    'limit',
    'populate',
    'lean',
    'select',
  ]) {
    q[method] = vi.fn().mockReturnValue(q);
  }
  return q;
};

const postRecord = (overrides: Record<string, unknown> = {}) => ({
  _id: postId,
  title: 'Cairo',
  body: 'Trip notes',
  status: PostStatus.DRAFT,
  tagIds: [{ _id: egyptTagId, name: 'egypt' }],
  imageUrls: [],
  userId: authorId,
  createdAt: new Date('2026-11-01'),
  updatedAt: new Date('2026-11-01'),
  ...overrides,
});

/** A post document as loaded for writing. */
const postDoc = (overrides: Record<string, unknown> = {}) => ({
  _id: postId,
  userId: authorId,
  title: 'Cairo',
  imageUrls: [] as string[],
  status: PostStatus.PUBLISHED,
  save: vi.fn().mockResolvedValue(undefined),
  deleteOne: vi.fn().mockResolvedValue(undefined),
  set: vi.fn(),
  ...overrides,
});

describe('BlogService', () => {
  let postModel: MockModel;
  let tagModel: MockModel;
  let likeModel: MockModel;
  let commentModel: MockModel;
  let itineraryModel: MockModel;
  let uploadService: { uploadImage: ReturnType<typeof vi.fn> };
  let service: BlogService;

  beforeEach(() => {
    postModel = {
      create: vi.fn().mockResolvedValue({ _id: postId }),
      findById: vi.fn().mockReturnValue(query(postRecord())),
      find: vi.fn(),
      countDocuments: vi.fn(),
    };
    tagModel = {
      bulkWrite: vi.fn().mockResolvedValue({}),
      find: vi
        .fn()
        .mockReturnValue(query([{ _id: egyptTagId, name: 'egypt' }])),
    };
    likeModel = {
      aggregate: vi.fn(),
      deleteMany: vi.fn().mockReturnValue(query({})),
    };
    commentModel = {
      aggregate: vi.fn(),
      deleteMany: vi.fn().mockReturnValue(query({})),
    };
    itineraryModel = { findOne: vi.fn() };
    uploadService = {
      uploadImage: vi.fn().mockResolvedValue({ url: imageUrl('new') }),
    };
    service = new BlogService(
      postModel as never,
      tagModel as never,
      likeModel as never,
      commentModel as never,
      itineraryModel as never,
      uploadService as never,
    );
  });

  /** The first findById loads the document to change, the next one re-reads it for the response. */
  const loadForWrite = (doc: ReturnType<typeof postDoc>) =>
    postModel.findById
      .mockReturnValueOnce(query(doc))
      .mockReturnValue(query(postRecord()));

  describe('createPost (BLG-01, BLG-08)', () => {
    it('saves a draft by default with normalised, de-duplicated tags', async () => {
      const result = await service.createPost(authorId.toString(), {
        title: 'Cairo',
        body: 'Trip notes',
        tags: ['Egypt', 'egypt '],
      });

      expect(tagModel.bulkWrite).toHaveBeenCalledWith([
        {
          updateOne: {
            filter: { name: 'egypt' },
            update: { $setOnInsert: { name: 'egypt' } },
            upsert: true,
          },
        },
      ]);
      expect(postModel.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: PostStatus.DRAFT,
          tagIds: [egyptTagId],
          userId: authorId,
        }),
      );
      expect(result).toMatchObject({
        id: postId.toString(),
        tags: ['egypt'],
        images: [],
        authorId: authorId.toString(),
      });
    });

    it('does not touch tags when none are given', async () => {
      await service.createPost(authorId.toString(), {
        title: 'A',
        body: 'B',
        status: PostStatus.PUBLISHED,
      });
      expect(tagModel.bulkWrite).not.toHaveBeenCalled();
      expect(postModel.create).toHaveBeenCalledWith(
        expect.objectContaining({ status: PostStatus.PUBLISHED, tagIds: [] }),
      );
    });
  });

  describe('listMyPosts / getOwnPost (BLG-03)', () => {
    it('returns a page of own posts with like and comment counts', async () => {
      postModel.countDocuments.mockReturnValue(query(11));
      postModel.find.mockReturnValue(query([postRecord()]));
      likeModel.aggregate.mockReturnValue(query([{ _id: postId, count: 3 }]));
      commentModel.aggregate.mockReturnValue(query([]));

      const result = await service.listMyPosts(authorId.toString(), 2);

      expect(postModel.find).toHaveBeenCalledWith({ userId: authorId });
      expect(result).toMatchObject({
        page: 2,
        pageSize: 10,
        total: 11,
        totalPages: 2,
      });
      expect(result.items[0]).toMatchObject({
        likeCount: 3,
        commentCount: 0,
        tags: ['egypt'],
      });
    });

    it("refuses to open another user's draft", async () => {
      await expect(
        service.getOwnPost(postId.toString(), otherUserId.toString()),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updatePost / deletePost (BLG-04)', () => {
    it('updates only the fields sent', async () => {
      const doc = postDoc({ status: PostStatus.DRAFT });
      loadForWrite(doc);

      await service.updatePost(postId.toString(), authorId.toString(), {
        status: PostStatus.PUBLISHED,
      });

      expect(doc).toMatchObject({
        title: 'Cairo',
        status: PostStatus.PUBLISHED,
      });
      expect(doc.save).toHaveBeenCalled();
      expect(tagModel.bulkWrite).not.toHaveBeenCalled();
    });

    it("rejects editing another user's post with 403", async () => {
      loadForWrite(postDoc({ userId: otherUserId }));
      await expect(
        service.updatePost(postId.toString(), authorId.toString(), {
          title: 'X',
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('returns 404 for an invalid or unknown id', async () => {
      await expect(
        service.deletePost('not-an-id', authorId.toString()),
      ).rejects.toThrow(NotFoundException);
      postModel.findById.mockReturnValue(query(null));
      await expect(
        service.deletePost(postId.toString(), authorId.toString()),
      ).rejects.toThrow(NotFoundException);
    });

    it('deletes the post together with its likes and comments', async () => {
      const doc = postDoc();
      loadForWrite(doc);

      await service.deletePost(postId.toString(), authorId.toString());

      expect(likeModel.deleteMany).toHaveBeenCalledWith({ postId });
      expect(commentModel.deleteMany).toHaveBeenCalledWith({ postId });
      expect(doc.deleteOne).toHaveBeenCalled();
    });
  });

  describe('images (BLG-10)', () => {
    const file = { buffer: Buffer.from('x') } as Express.Multer.File;

    it('uploads and attaches an image', async () => {
      const doc = postDoc({ imageUrls: [imageUrl('a')] });
      loadForWrite(doc);

      await service.addImage(postId.toString(), authorId.toString(), file);

      expect(uploadService.uploadImage).toHaveBeenCalledWith(file);
      expect(doc.imageUrls).toEqual([imageUrl('a'), imageUrl('new')]);
      expect(doc.save).toHaveBeenCalled();
    });

    it('rejects a sixth image before uploading anything', async () => {
      loadForWrite(
        postDoc({ imageUrls: ['a', 'b', 'c', 'd', 'e'].map(imageUrl) }),
      );
      await expect(
        service.addImage(postId.toString(), authorId.toString(), file),
      ).rejects.toThrow(BadRequestException);
      expect(uploadService.uploadImage).not.toHaveBeenCalled();
    });

    it('removes an image by its id and 404s on an unknown one', async () => {
      const doc = postDoc({ imageUrls: [imageUrl('a'), imageUrl('b')] });
      loadForWrite(doc);
      await service.removeImage(postId.toString(), authorId.toString(), 'a');
      expect(doc.imageUrls).toEqual([imageUrl('b')]);

      loadForWrite(postDoc({ imageUrls: [imageUrl('b')] }));
      await expect(
        service.removeImage(postId.toString(), authorId.toString(), 'zzz'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('attachItinerary (BLG-13)', () => {
    it("attaches one of the author's own itineraries", async () => {
      const doc = postDoc();
      loadForWrite(doc);
      itineraryModel.findOne.mockReturnValue(query({ _id: itineraryId }));

      await service.attachItinerary(
        postId.toString(),
        authorId.toString(),
        itineraryId.toString(),
      );

      expect(itineraryModel.findOne).toHaveBeenCalledWith({
        _id: itineraryId,
        userId: authorId,
      });
      expect(doc).toMatchObject({ itineraryId });
    });

    it("answers 404 for someone else's itinerary", async () => {
      loadForWrite(postDoc());
      itineraryModel.findOne.mockReturnValue(query(null));
      await expect(
        service.attachItinerary(
          postId.toString(),
          authorId.toString(),
          itineraryId.toString(),
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('detaches with null', async () => {
      const doc = postDoc();
      loadForWrite(doc);
      await service.attachItinerary(
        postId.toString(),
        authorId.toString(),
        null,
      );
      expect(doc.set).toHaveBeenCalledWith('itineraryId', undefined);
      expect(itineraryModel.findOne).not.toHaveBeenCalled();
    });
  });
});

describe('CommentsService (BLG-05, BLG-07)', () => {
  let commentModel: MockModel;
  let postModel: MockModel;
  let userModel: MockModel;
  let service: CommentsService;

  const commentRecord = (status = UserActivityStatus.ACTIVE) => ({
    _id: commentId,
    postId,
    text: 'Nice',
    userId: { _id: authorId, fullName: 'Rushdy', status },
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  beforeEach(() => {
    commentModel = {
      create: vi.fn().mockResolvedValue({ _id: commentId }),
      findById: vi.fn().mockReturnValue(query(commentRecord())),
    };
    postModel = { findOne: vi.fn().mockReturnValue(query(postDoc())) };
    userModel = {
      findById: vi
        .fn()
        .mockReturnValue(query({ status: UserActivityStatus.ACTIVE })),
    };
    service = new CommentsService(
      commentModel as never,
      postModel as never,
      userModel as never,
    );
  });

  it('only comments on published posts', async () => {
    await service.addComment(postId.toString(), authorId.toString(), 'Nice');
    expect(postModel.findOne).toHaveBeenCalledWith({
      _id: postId,
      status: PostStatus.PUBLISHED,
    });

    postModel.findOne.mockReturnValue(query(null));
    await expect(
      service.addComment(postId.toString(), authorId.toString(), 'Nice'),
    ).rejects.toThrow(NotFoundException);
  });

  it('hides posts of deactivated authors (ACC-12)', async () => {
    userModel.findById.mockReturnValue(
      query({ status: UserActivityStatus.INACTIVE }),
    );
    await expect(
      service.addComment(postId.toString(), authorId.toString(), 'Nice'),
    ).rejects.toThrow(NotFoundException);
  });

  it('shows a deactivated author as "Deleted user" (ACC-12)', async () => {
    commentModel.findById.mockReturnValue(
      query(commentRecord(UserActivityStatus.INACTIVE)),
    );
    const result = await service.addComment(
      postId.toString(),
      authorId.toString(),
      'Nice',
    );
    expect(result.author).toEqual({ id: null, name: 'Deleted user' });
  });

  it("rejects editing someone else's comment with 403", async () => {
    commentModel.findById.mockReturnValue(
      query({ _id: commentId, userId: otherUserId }),
    );
    await expect(
      service.updateComment(commentId.toString(), authorId.toString(), 'X'),
    ).rejects.toThrow(ForbiddenException);
  });
});

describe('LikesService (BLG-06)', () => {
  let likeModel: MockModel;
  let service: LikesService;

  beforeEach(() => {
    likeModel = {
      create: vi.fn().mockResolvedValue({}),
      deleteOne: vi.fn().mockReturnValue(query({ deletedCount: 1 })),
      countDocuments: vi.fn().mockReturnValue(query(4)),
    };
    const postModel = { findOne: vi.fn().mockReturnValue(query(postDoc())) };
    const userModel = {
      findById: vi
        .fn()
        .mockReturnValue(query({ status: UserActivityStatus.ACTIVE })),
    };
    service = new LikesService(
      likeModel as never,
      postModel as never,
      userModel as never,
    );
  });

  it('likes a post and returns the new count', async () => {
    await expect(
      service.like(postId.toString(), authorId.toString()),
    ).resolves.toEqual({ liked: true, likeCount: 4 });
  });

  it('answers 409 on a second like', async () => {
    likeModel.create.mockRejectedValue({ code: 11000 });
    await expect(
      service.like(postId.toString(), authorId.toString()),
    ).rejects.toThrow(ConflictException);
  });

  it('answers 404 when removing a like that does not exist', async () => {
    likeModel.deleteOne.mockReturnValue(query({ deletedCount: 0 }));
    await expect(
      service.unlike(postId.toString(), authorId.toString()),
    ).rejects.toThrow(NotFoundException);
  });
});

describe('blog helpers', () => {
  it('takes the image id from the URL file name', () => {
    expect(imageIdFromUrl(imageUrl('abc-123'))).toBe('abc-123');
  });

  it('escapes regex characters in search keywords (BLG-09)', () => {
    expect(new RegExp(escapeRegex('a.b*')).test('a.b*')).toBe(true);
    expect(new RegExp(escapeRegex('a.b*')).test('axbbb')).toBe(false);
  });

  it('cuts long bodies into an excerpt', () => {
    expect(excerpt('short')).toBe('short');
    expect(excerpt('x'.repeat(300))).toHaveLength(203);
  });
});
