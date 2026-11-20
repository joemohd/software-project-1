import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { LoginRequired } from './blog.decorators.js';
import { CommentsService } from './comments.service.js';
import { CommentDto } from './dto/comment.dto.js';
import { CommentResponseDto } from './dto/post-response.dto.js';

@ApiTags('Blog')
@LoginRequired()
@Controller('comments')
export class CommentsController {
  constructor(private readonly commentsService: CommentsService) {}

  // PATCH /api/comments/:id (BLG-07)
  @Patch(':id')
  @ApiOperation({ summary: 'Edit my comment (BLG-07)' })
  @ApiOkResponse({ type: CommentResponseDto })
  @ApiBadRequestResponse({
    description: 'Empty comment or longer than 500 characters.',
  })
  @ApiForbiddenResponse({ description: 'The comment belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Comment not found.' })
  updateComment(
    @Param('id') commentId: string,
    @CurrentUser('id') userId: string,
    @Body() dto: CommentDto,
  ): Promise<CommentResponseDto> {
    return this.commentsService.updateComment(commentId, userId, dto.text);
  }

  // DELETE /api/comments/:id (BLG-07)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete my comment (BLG-07)' })
  @ApiNoContentResponse({ description: 'Comment deleted.' })
  @ApiForbiddenResponse({ description: 'The comment belongs to another user.' })
  @ApiNotFoundResponse({ description: 'Comment not found.' })
  deleteComment(
    @Param('id') commentId: string,
    @CurrentUser('id') userId: string,
  ): Promise<void> {
    return this.commentsService.deleteComment(commentId, userId);
  }
}
