import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PostStatus } from '../../database/schemas/blog-post.schema.js';

// Shared page fields (GEN-05)
class PageMetaDto {
  @ApiProperty()
  page: number;

  @ApiProperty()
  pageSize: number;

  @ApiProperty()
  total: number;

  @ApiProperty()
  totalPages: number;
}

// BLG-10: an attached image; "id" is what DELETE /api/posts/:id/images/:imageId expects
export class PostImageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  url: string;
}

// The author of a post or comment. A deactivated author shows as "Deleted user" with a null id (ACC-12).
export class AuthorSummaryDto {
  @ApiPropertyOptional({ type: String, nullable: true })
  id: string | null;

  @ApiProperty()
  name: string;
}

// BLG-01, BLG-04, BLG-10, BLG-13: a post as returned to its author
export class PostResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ enum: PostStatus })
  status: PostStatus;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ type: [PostImageDto] })
  images: PostImageDto[];

  @ApiProperty()
  authorId: string;

  @ApiPropertyOptional({ nullable: true, type: String })
  itineraryId: string | null;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

// BLG-03: one row of the "my posts" list
export class MyPostSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ enum: PostStatus })
  status: PostStatus;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty()
  likeCount: number;

  @ApiProperty()
  commentCount: number;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class MyPostsPageDto extends PageMetaDto {
  @ApiProperty({ type: [MyPostSummaryDto] })
  items: MyPostSummaryDto[];
}

// BLG-02, BLG-08, BLG-09, BLG-12: one published post in a public list or search result
export class PublicPostSummaryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty({ description: 'The first 200 characters of the body.' })
  excerpt: string;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ type: AuthorSummaryDto })
  author: AuthorSummaryDto;

  @ApiProperty()
  likeCount: number;

  @ApiProperty()
  commentCount: number;

  @ApiProperty()
  createdAt: Date;
}

export class PublicPostsPageDto extends PageMetaDto {
  @ApiProperty({
    type: [PublicPostSummaryDto],
    description: 'Empty when nothing matches ("no results").',
  })
  items: PublicPostSummaryDto[];
}

// BLG-05, BLG-07
export class CommentResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  postId: string;

  @ApiProperty()
  text: string;

  @ApiProperty({ type: AuthorSummaryDto })
  author: AuthorSummaryDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class CommentsPageDto extends PageMetaDto {
  @ApiProperty({ type: [CommentResponseDto] })
  items: CommentResponseDto[];
}

// BLG-13: the itinerary shown on a post page (only when it is public)
export class AttachedItineraryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  startDate: Date;
}

// BLG-02: the full public post page
export class PublicPostDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  body: string;

  @ApiProperty({ type: [String] })
  tags: string[];

  @ApiProperty({ type: [PostImageDto] })
  images: PostImageDto[];

  @ApiProperty({ type: AuthorSummaryDto })
  author: AuthorSummaryDto;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;

  @ApiProperty()
  likeCount: number;

  @ApiProperty({
    type: CommentsPageDto,
    description: 'Comments in chronological order.',
  })
  comments: CommentsPageDto;

  @ApiPropertyOptional({ type: AttachedItineraryDto, nullable: true })
  itinerary: AttachedItineraryDto | null;
}

// BLG-06
export class LikeStatusDto {
  @ApiProperty()
  liked: boolean;

  @ApiProperty()
  likeCount: number;
}

// BLG-12: a public itinerary listed on the author page
export class AuthorItineraryDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  title: string;

  @ApiProperty()
  startDate: Date;

  @ApiProperty()
  dayCount: number;
}

export class AuthorItinerariesPageDto extends PageMetaDto {
  @ApiProperty({ type: [AuthorItineraryDto] })
  items: AuthorItineraryDto[];
}

// BLG-12: the public author page
export class AuthorPageDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  name: string;

  @ApiProperty()
  username: string;

  @ApiProperty({ description: 'When the author joined.' })
  joinedAt: Date;

  @ApiProperty({ type: PublicPostsPageDto })
  posts: PublicPostsPageDto;

  @ApiProperty({ type: AuthorItinerariesPageDto })
  itineraries: AuthorItinerariesPageDto;
}
