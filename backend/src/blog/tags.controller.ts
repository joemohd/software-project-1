import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { PaginationQueryDto } from './dto/pagination-query.dto.js';
import { PublicPostsPageDto } from './dto/post-response.dto.js';
import { PublicBlogService } from './public-blog.service.js';

@ApiTags('Blog')
@Public()
@Controller('tags')
export class TagsController {
  constructor(private readonly publicBlogService: PublicBlogService) {}

  // GET /api/tags/:tag/posts (BLG-08) - what a clickable tag opens
  @Get(':tag/posts')
  @ApiOperation({
    summary: 'List published posts with a tag, newest first (BLG-08)',
  })
  @ApiOkResponse({ type: PublicPostsPageDto })
  listByTag(
    @Param('tag') tag: string,
    @Query() query: PaginationQueryDto,
  ): Promise<PublicPostsPageDto> {
    return this.publicBlogService.listPublished({
      page: query.page,
      tag: tag.trim(),
    });
  }
}
