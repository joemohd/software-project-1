import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
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
import { CreateReviewDto } from './dto/create-review.dto.js';
import {
  CancelHotelBookingResponseDto,
  HotelReservationDetailDto,
  HotelReservationGroupsResponseDto,
  ReviewResponseDto,
} from './dto/hotel-booking-response.dto.js';

@ApiTags('Hotel bookings')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Not a registered user' })
@Roles(UserRole.USER)
@Controller('hotel-bookings')
export class HotelBookingsController {
  constructor(private readonly bookingsService: HotelBookingsService) { }

  @Get()
  @ApiOperation({ summary: 'HTL-20: list my reservations (Upcoming / Past / Cancelled)' })
  @ApiOkResponse({ type: HotelReservationGroupsResponseDto })
  listMine(@CurrentUser() user: AuthenticatedUser): Promise<HotelReservationGroupsResponseDto> {
    return this.bookingsService.listMine(user);
  }

  @Get(':id')
  @ApiOperation({ summary: 'HTL-20: full details of one of my reservations' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  @ApiOkResponse({ type: HotelReservationDetailDto })
  @ApiNotFoundResponse({ description: "Reservation not found (also when it belongs to another user)" })
  getMine(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<HotelReservationDetailDto> {
    return this.bookingsService.getMine(id, user);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'HTL-21: cancel my Confirmed reservation (computes refund and issues Stripe refund per PAY-03)' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  @ApiOkResponse({ type: CancelHotelBookingResponseDto })
  @ApiBadRequestResponse({ description: 'Only a Confirmed reservation can be cancelled, and only before its check-in date' })
  @ApiNotFoundResponse({ description: "Reservation not found (also when it belongs to another user)" })
  cancel(@Param('id') id: string, @CurrentUser() user: AuthenticatedUser): Promise<CancelHotelBookingResponseDto> {
    return this.bookingsService.cancel(id, user);
  }

  @Post(':id/review')
  @ApiOperation({ summary: 'HTL-23: submit the review for a Completed reservation' })
  @ApiParam({ name: 'id', description: 'Reservation id' })
  @ApiCreatedResponse({ type: ReviewResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid rating/comment, or reservation stay is not completed yet' })
  @ApiNotFoundResponse({ description: "Reservation not found (also when it belongs to another user)" })
  @ApiConflictResponse({ description: 'This reservation has already been reviewed' })
  review(
    @Param('id') id: string,
    @Body() dto: CreateReviewDto,
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<ReviewResponseDto | null> {
    return this.bookingsService.submitReview(id, user, dto);
  }
}
