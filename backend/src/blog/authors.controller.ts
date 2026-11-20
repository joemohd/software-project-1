import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { AuthorPageQueryDto } from './dto/author-page-query.dto.js';
import { AuthorPageDto } from './dto/post-response.dto.js';
import { PublicBlogService } from './public-blog.service.js';

@ApiTags('Blog')
@Public()
@Controller('authors')
export class AuthorsController {
  constructor(private readonly publicBlogService: PublicBlogService) {}

  // GET /api/authors/:id (BLG-12)
  @Get(':id')
  @ApiOperation({
    summary:
      'Public author page: name, join date, published posts and public itineraries (BLG-12)',
  })
  @ApiOkResponse({ type: AuthorPageDto })
  @ApiNotFoundResponse({ description: 'Author not found or deactivated.' })
  getAuthor(
    @Param('id') authorId: string,
    @Query() query: AuthorPageQueryDto,
  ): Promise<AuthorPageDto> {
    return this.publicBlogService.getAuthorPage(
      authorId,
      query.postsPage,
      query.itinerariesPage,
    );
  }
}
