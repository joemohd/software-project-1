import {
  Body,
  Controller,
  Get,
  Param,
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
import { HotelBookingsService } from './hotel-bookings.service.js';
import { ReviewsService } from '../reviews/reviews.service.js';
import { CreateReviewDto } from '../reviews/dto/create-review.dto.js';
import { JwtAuthGuard } from '../common/auth/jwt-auth.guard.js';
import { RolesGuard } from '../common/auth/roles.guard.js';
import { Roles } from '../common/auth/roles.decorator.js';
import { CurrentUser } from '../common/auth/current-user.decorator.js';
import { Role } from '../common/enums/role.enum.js';
import type { JwtUser } from '../common/auth/jwt-user.interface.js';

@ApiTags('Hotel Bookings')
@ApiBearerAuth('access-token')
@ApiCookieAuth('access_token')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.USER)
@Controller('hotel-bookings')
export class HotelBookingsController {
  constructor(
    private readonly bookingsService: HotelBookingsService,
    private readonly reviewsService: ReviewsService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'HTL-20 — list my reservations (Upcoming / Past / Cancelled)' })
  listMine(@CurrentUser() user: JwtUser) {
    return this.bookingsService.listMine(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'HTL-20 — full details of one of my reservations' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  getMine(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.bookingsService.getMine(id, user);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'HTL-21 — cancel my Confirmed reservation (computes refund)' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  cancel(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.bookingsService.cancel(id, user);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'HTL-23 — submit the review for a Completed reservation' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  review(
    @Param('id') id: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reviewsService.createForBooking(id, user, dto);
  }
}
