import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { HotelBookingsService } from './hotel-bookings.service.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { ReplyReviewDto } from './dto/reply-review.dto.js';
import { DeleteReviewResponseDto, ReviewResponseDto } from './dto/hotel-booking-response.dto.js';

@ApiTags('Reviews')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly bookingsService: HotelBookingsService) { }

  @Patch(':id')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'HTL-23: edit your own hotel review' })
  @ApiParam({ name: 'id', description: 'Review id' })
  @ApiOkResponse({ type: ReviewResponseDto })
  @ApiBadRequestResponse({ description: 'Provide at least one of rating or comment' })
  @ApiForbiddenResponse({ description: 'You can only edit your own review' })
  @ApiNotFoundResponse({ description: 'Review not found' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewResponseDto | null> {
    return this.bookingsService.updateReview(id, user, dto);
  }

  @Delete(':id')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'HTL-23: delete your own hotel review' })
  @ApiParam({ name: 'id', description: 'Review id' })
  @ApiOkResponse({ type: DeleteReviewResponseDto })
  @ApiForbiddenResponse({ description: 'You can only delete your own review' })
  @ApiNotFoundResponse({ description: 'Review not found' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<DeleteReviewResponseDto> {
    return this.bookingsService.deleteReview(id, user);
  }

  @Post(':id/reply')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-26: hotel moderator replies to a review' })
  @ApiParam({ name: 'id', description: 'Review id' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid reply text' })
  @ApiForbiddenResponse({ description: 'You can only reply to reviews of your own hotel' })
  @ApiNotFoundResponse({ description: 'Review not found' })
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewResponseDto | null> {
    return this.bookingsService.replyToReview(id, user, dto);
  }
}
