import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
import { CreateReviewDto } from './dto/create-review.dto.js';

@ApiTags('Hotel Bookings')
@ApiCookieAuth()
@Roles(UserRole.USER)
@Controller('hotel-bookings')
export class HotelBookingsController {
  constructor(private readonly bookingsService: HotelBookingsService) {}

  @Get()
  @ApiOperation({ summary: 'HTL-20: list my reservations (Upcoming / Past / Cancelled)' })
  listMine(@CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.listMine(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'HTL-20: full details of one of my reservations' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  getMine(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.getMine(id, user);
  }

  @Post(':id/cancel')
  @ApiOperation({ summary: 'HTL-21: cancel my Confirmed reservation (computes refund)' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser) {
    return this.bookingsService.cancel(id, user);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'HTL-23: submit the review for a Completed reservation' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  review(
    @Param('id') id: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.bookingsService.submitReview(id, user, dto);
  }
}
