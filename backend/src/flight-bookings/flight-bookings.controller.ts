import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
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
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { CreateFlightBookingDto } from './dto/create-flight-booking.dto.js';
import { FlightBookingListResponseDto, FlightBookingResponseDto } from './dto/flight-booking-response.dto.js';
import { ListFlightBookingsQueryDto } from './dto/list-flight-bookings.dto.js';
import { FlightBookingsService } from './flight-bookings.service.js';

// FLT-19, FLT-25: registered users book and see their own bookings (moderators and admins get 403); email verification
// is optional, so unverified users are not rejected
@ApiTags('Flight bookings')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Not a registered user (moderator/admin), or account suspended or inactive' })
@Roles(UserRole.USER)
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(private readonly flightBookingsService: FlightBookingsService) {}

  // POST /api/flight-bookings (FLT-19, FLT-21)
  @Post()
  @ApiOperation({
    summary: 'Book a one-way or round-trip flight and hold the seats for 10 minutes',
    description:
      'One segment = one-way, two = round trip (outbound first; the return flies the reverse route after the outbound lands). ' +
      'Passenger types come from the date of birth on the outbound departure date: adult 12+, child 2-11, infant under 2 ' +
      '(no seat, 10% of the seat price). At least one adult, no more infants than adults. Extra bags: up to the airline\'s ' +
      "maximum per passenger, each up to the flight's maximum bag weight, charged per flight. The booking is saved as " +
      'Pending Payment and expires if not paid before holdExpiresAt. Prices are in cents. ' +
      'The reference is null until the booking is Confirmed.',
  })
  @ApiCreatedResponse({ type: FlightBookingResponseDto, description: 'Booking summary (FLT-21)' })
  @ApiBadRequestResponse({
    description:
      'Invalid body, same flight twice, return not the reverse route or not after the outbound arrival, cabin not on the flight, ' +
      'invalid date of birth, no adult, more infants than adults, duplicate passport, too many or too heavy extra bags',
  })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiConflictResponse({
    description: 'Flight not Scheduled or already departed, airline inactive, not enough seats, or seats taken by concurrent bookings',
  })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateFlightBookingDto): Promise<FlightBookingResponseDto> {
    return this.flightBookingsService.create(userId, dto);
  }

  // GET /api/flight-bookings (FLT-25)
  @Get()
  @ApiOperation({
    summary: 'Your flight bookings, grouped as upcoming, past and cancelled',
    description:
      'Upcoming/past by the outbound flight\'s departure time; cancelled includes expired bookings. ' +
      'Each group is paged on its own (10 per page, newest booking first). Overdue seat holds are expired first.',
  })
  @ApiOkResponse({ type: FlightBookingListResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid page number' })
  list(@CurrentUser('id') userId: string, @Query() query: ListFlightBookingsQueryDto): Promise<FlightBookingListResponseDto> {
    return this.flightBookingsService.listForUser(userId, query);
  }

  // GET /api/flight-bookings/:id (FLT-25)
  @Get(':id')
  @ApiOperation({ summary: 'One of your flight bookings', description: 'Same summary as when booking. The reference is null until the booking is Confirmed.' })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: FlightBookingResponseDto })
  @ApiNotFoundResponse({ description: "Booking not found (also when it is someone else's)" })
  findOne(@CurrentUser('id') userId: string, @Param('id') bookingId: string): Promise<FlightBookingResponseDto> {
    return this.flightBookingsService.findOneForUser(userId, bookingId);
  }
}
