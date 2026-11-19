import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { ReviewsService } from './reviews.service.js';
import { UpdateReviewDto } from './dto/update-review.dto.js';
import { ReplyReviewDto } from './dto/reply-review.dto.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/auth/roles.guard.js';
import { Roles } from '../common/auth/roles.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { JwtUser } from '../common/auth/jwt-user.interface.js';

@ApiTags('Reviews')
@ApiBearerAuth('access-token')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reviews')
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Patch(':id')
  @ApiOperation({ summary: 'HTL-23 — edit your own hotel review' })
  @ApiParam({ name: 'id', description: 'Review id' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateReviewDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reviewsService.update(id, user, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'HTL-23 — delete your own hotel review' })
  @ApiParam({ name: 'id', description: 'Review id' })
  remove(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.reviewsService.remove(id, user);
  }

  @Post(':id/reply')
  @Roles(Role.HOTEL_MODERATOR)
  @ApiOperation({ summary: "HTL-26 — hotel moderator replies to a review (bonus)" })
  @ApiParam({ name: 'id', description: 'Review id' })
  reply(
    @Param('id') id: string,
    @Body() dto: ReplyReviewDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reviewsService.reply(id, user, dto);
  }
}
