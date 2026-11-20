import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBadRequestResponse,
  ApiBody,
  ApiConflictResponse,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { imageUploadOptions } from '../common/upload/image-upload.options.js';
import { LoginRequired } from './blog.decorators.js';
import { BlogService } from './blog.service.js';
import { CommentsService } from './comments.service.js';
import { AttachItineraryDto } from './dto/attach-itinerary.dto.js';
import { CommentDto } from './dto/comment.dto.js';
import { CreatePostDto } from './dto/create-post.dto.js';
import { ListPostsQueryDto } from './dto/list-posts-query.dto.js';
import { PaginationQueryDto } from './dto/pagination-query.dto.js';
import { PostPageQueryDto } from './dto/post-page-query.dto.js';
import {
  CommentResponseDto,
  LikeStatusDto,
  MyPostsPageDto,
  PostResponseDto,
  PublicPostDto,
  PublicPostsPageDto,
} from './dto/post-response.dto.js';
import { UpdatePostDto } from './dto/update-post.dto.js';
import { LikesService } from './likes.service.js';
import { PublicBlogService } from './public-blog.service.js';

// Static paths ("mine") are declared before ":id" so they aren't read as a post id
@ApiTags('Blog')
@Controller('posts')
export class BlogController {
  constructor(
    private readonly blogService: BlogService,
    private readonly publicBlogService: PublicBlogService,
    private readonly commentsService: CommentsService,
    private readonly likesService: LikesService,
  ) {}

  // GET /api/posts (BLG-02, BLG-09)
  @Public()
  @Get()
  @ApiOperation({
    summary: 'Browse or search published posts (BLG-02, BLG-09)',
    description:
      'Filter by tag with "tag" and search the title, tags and author name with "q". Search results are ordered by likes + comments, newest first on ties; without "q" the newest posts come first.',
  })
  @ApiOkResponse({ type: PublicPostsPageDto })
  listPosts(@Query() query: ListPostsQueryDto): Promise<PublicPostsPageDto> {
    return this.publicBlogService.listPublished(query);
  }

  // POST /api/posts (BLG-01)
  @Post()
  @LoginRequired()
  @ApiOperation({ summary: 'Create a post as Draft or Published (BLG-01)' })
  @ApiCreatedResponse({ type: PostResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed.' })
  createPost(
    @CurrentUser('id') userId: string,
    @Body() dto: CreatePostDto,
  ): Promise<PostResponseDto> {
    return this.blogService.createPost(userId, dto);
  }

  // GET /api/posts/mine (BLG-03)
  @Get('mine')
  @LoginRequired()
  @ApiOperation({ summary: 'List my own posts, drafts included (BLG-03)' })
  @ApiOkResponse({ type: MyPostsPageDto })
  listMyPosts(
    @CurrentUser('id') userId: string,
    @Query() query: PaginationQueryDto,
  ): Promise<MyPostsPageDto> {
    return this.blogService.listMyPosts(userId, query.page);
  }

  // GET /api/posts/mine/:id (BLG-03, BLG-04) - added so an author can open a draft to edit it
  @Get('mine/:id')
  @LoginRequired()
  @ApiOperation({
    summary: 'Open one of my posts, drafts included (BLG-03, BLG-04)',
  })
  @ApiOkResponse({ type: PostResponseDto })
  @ApiForbiddenResponse({ description: 'The post belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Post not found.' })
  getMyPost(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PostResponseDto> {
    return this.blogService.getOwnPost(postId, userId);
  }

  // GET /api/posts/:id (BLG-02)
  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Open a published post with its like count and comments (BLG-02)',
  })
  @ApiOkResponse({ type: PublicPostDto })
  @ApiNotFoundResponse({
    description: 'Post not found, not published or hidden.',
  })
  getPost(
    @Param('id') postId: string,
    @Query() query: PostPageQueryDto,
  ): Promise<PublicPostDto> {
    return this.publicBlogService.getPublicPost(postId, query.commentsPage);
  }

  // PATCH /api/posts/:id (BLG-04, BLG-08)
  @Patch(':id')
  @LoginRequired()
  @ApiOperation({
    summary: 'Edit my post: title, body, tags or status (BLG-04, BLG-08)',
  })
  @ApiOkResponse({ type: PostResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed.' })
  @ApiForbiddenResponse({ description: 'The post belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Post not found.' })
  updatePost(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: UpdatePostDto,
  ): Promise<PostResponseDto> {
    return this.blogService.updatePost(postId, userId, dto);
  }

  // DELETE /api/posts/:id (BLG-04)
  @Delete(':id')
  @LoginRequired()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete my post with its likes and comments (BLG-04)',
  })
  @ApiNoContentResponse({ description: 'Post deleted.' })
  @ApiForbiddenResponse({ description: 'The post belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Post not found.' })
  deletePost(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.blogService.deletePost(postId, userId);
  }

  // POST /api/posts/:id/comments (BLG-05)
  @Post(':id/comments')
  @LoginRequired()
  @ApiOperation({ summary: 'Comment on a published post (BLG-05)' })
  @ApiCreatedResponse({ type: CommentResponseDto })
  @ApiBadRequestResponse({
    description: 'Empty comment or longer than 500 characters.',
  })
  @ApiNotFoundResponse({ description: 'Post not found or not published.' })
  addComment(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CommentDto,
  ): Promise<CommentResponseDto> {
    return this.commentsService.addComment(postId, userId, dto.text);
  }

  // POST /api/posts/:id/like (BLG-06)
  @Post(':id/like')
  @LoginRequired()
  @ApiOperation({ summary: 'Like a published post once (BLG-06)' })
  @ApiCreatedResponse({ type: LikeStatusDto })
  @ApiConflictResponse({ description: 'You already liked this post.' })
  @ApiNotFoundResponse({ description: 'Post not found or not published.' })
  like(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
  ): Promise<LikeStatusDto> {
    return this.likesService.like(postId, userId);
  }

  // DELETE /api/posts/:id/like (BLG-06)
  @Delete(':id/like')
  @LoginRequired()
  @ApiOperation({ summary: 'Remove my like from a post (BLG-06)' })
  @ApiOkResponse({ type: LikeStatusDto })
  @ApiNotFoundResponse({ description: 'You have not liked this post.' })
  unlike(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
  ): Promise<LikeStatusDto> {
    return this.likesService.unlike(postId, userId);
  }

  // POST /api/posts/:id/images (BLG-10, GEN-08)
  @Post(':id/images')
  @LoginRequired()
  @UseInterceptors(FileInterceptor('file', imageUploadOptions))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
      required: ['file'],
    },
  })
  @ApiOperation({
    summary:
      'Attach a JPG or PNG image (max 5 MB, max 5 per post) to my post (BLG-10, GEN-08)',
  })
  @ApiCreatedResponse({ type: PostResponseDto })
  @ApiBadRequestResponse({
    description:
      'No file, wrong type, too large, or the post already has 5 images.',
  })
  @ApiForbiddenResponse({ description: 'The post belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Post not found.' })
  addImage(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ): Promise<PostResponseDto> {
    if (!file) throw new BadRequestException('Image file is required.');
    return this.blogService.addImage(postId, userId, file);
  }

  // DELETE /api/posts/:id/images/:imageId (BLG-10)
  @Delete(':id/images/:imageId')
  @LoginRequired()
  @ApiOperation({ summary: 'Remove an image from my post (BLG-10)' })
  @ApiOkResponse({ type: PostResponseDto })
  @ApiForbiddenResponse({ description: 'The post belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Post or image not found.' })
  removeImage(
    @Param('id') postId: string,
    @Param('imageId') imageId: string,
    @CurrentUser('id') userId: string,
  ): Promise<PostResponseDto> {
    return this.blogService.removeImage(postId, userId, imageId);
  }

  // PATCH /api/posts/:id/itinerary (BLG-13)
  @Patch(':id/itinerary')
  @LoginRequired()
  @ApiOperation({
    summary: 'Attach one of my itineraries to my post, or detach it (BLG-13)',
  })
  @ApiOkResponse({ type: PostResponseDto })
  @ApiForbiddenResponse({ description: 'The post belongs to another user.' })
  @ApiNotFoundResponse({
    description: 'Post not found, or the itinerary is not one of yours.',
  })
  attachItinerary(
    @Param('id') postId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: AttachItineraryDto,
  ): Promise<PostResponseDto> {
    return this.blogService.attachItinerary(postId, userId, dto.itineraryId);
  }
}
