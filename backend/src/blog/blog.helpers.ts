import { NotFoundException } from '@nestjs/common';
import { isValidObjectId, Model, Types } from 'mongoose';
import { BlogPost, PostStatus } from '../database/schemas/blog-post.schema.js';
import { User, UserActivityStatus } from '../database/schemas/user.schema.js';
import { EXCERPT_LENGTH, PAGE_SIZE } from './blog.constants.js';

/** Shown instead of the author's name when the author deactivated their account (ACC-12). */
export const DELETED_USER_NAME = 'Deleted user';

/** Turns a route id into an ObjectId, or answers 404 when it can't be one. */
export function toObjectIdOr404(id: string, entity: string): Types.ObjectId {
  if (!isValidObjectId(id)) throw new NotFoundException(`${entity} not found.`);
  return new Types.ObjectId(id);
}

/** Escapes a user-typed keyword so it is matched literally inside a regular expression (BLG-09). */
export function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** GEN-05 page metadata. */
export function pageInfo(page: number, total: number) {
  return {
    page,
    pageSize: PAGE_SIZE,
    total,
    totalPages: Math.ceil(total / PAGE_SIZE),
  };
}

export function excerpt(body: string): string {
  return body.length <= EXCERPT_LENGTH
    ? body
    : `${body.slice(0, EXCERPT_LENGTH).trimEnd()}...`;
}

/**
 * BLG-10: the id of an image is the last part of its URL without the extension.
 * The shared upload service names every image with a random UUID, so this is unique.
 */
export function imageIdFromUrl(url: string): string {
  const fileName = new URL(url).pathname.split('/').pop() ?? '';
  return fileName.replace(/\.[^.]+$/, '');
}

export function toImages(urls: string[]) {
  return urls.map((url) => ({ id: imageIdFromUrl(url), url }));
}

/**
 * Finds a post that guests may see: it is Published (not Draft, and not Archived, which is how
 * hidden posts are kept, GEN-10) and its author has not deactivated their account (ACC-12).
 * Anything else answers 404 so drafts and hidden posts are not revealed.
 */
export async function findPublicPost(
  postModel: Model<BlogPost>,
  userModel: Model<User>,
  postId: string,
) {
  const id = toObjectIdOr404(postId, 'Post');
  const post = await postModel
    .findOne({ _id: id, status: PostStatus.PUBLISHED })
    .exec();
  if (!post) throw new NotFoundException('Post not found.');

  const author = await userModel
    .findById(post.userId)
    .select('status')
    .lean<{ status: UserActivityStatus }>()
    .exec();
  if (!author || author.status === UserActivityStatus.INACTIVE) {
    throw new NotFoundException('Post not found.');
  }
  return post;
}
