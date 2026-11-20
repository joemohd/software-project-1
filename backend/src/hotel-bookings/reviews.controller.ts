import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { HotelBookingsService } from './hotel-bookings.service.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { ReplyReviewDto } from './dto/reply-review.dto.js';

@ApiTags('Reviews')
@ApiCookieAuth()
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly bookingsService: HotelBookingsService) {}

  @Patch(':id')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'HTL-23: edit your own hotel review' })
  @ApiParam({ name: 'id', description: 'Review id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.updateReview(id, user, dto);
  }

  @Delete(':id')
  @Roles(UserRole.USER)
  @ApiOperation({ summary: 'HTL-23: delete your own hotel review' })
  @ApiParam({ name: 'id', description: 'Review id' })
  remove(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.deleteReview(id, user);
  }

  @Post(':id/reply')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'HTL-26: hotel moderator replies to a review' })
  @ApiParam({ name: 'id', description: 'Review id' })
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.replyToReview(id, user, dto);
  }
}
