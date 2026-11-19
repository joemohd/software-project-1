import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { CreateFlightBookingDto } from './dto/create-flight-booking.dto.js';
import { FlightBookingResponseDto } from './dto/flight-booking-response.dto.js';
import { FlightBookingsService } from './flight-bookings.service.js';

// FLT-19: registered users book (moderators and admins get 403); email verification is optional, so unverified users
// are not rejected
@ApiTags('Flight bookings')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Not a registered user (moderator/admin), or account suspended or inactive' })
@Controller('flight-bookings')
export class FlightBookingsController {
  constructor(private readonly flightBookingsService: FlightBookingsService) {}

  // POST /api/flight-bookings (FLT-19, FLT-21, FLT-22)
  @Post()
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'Book a one-way or round-trip flight and hold the seats for 10 minutes',
    description:
      'One segment = one-way, two = round trip (outbound first; the return flies the reverse route after the outbound lands). ' +
      'Passenger types come from the date of birth on the outbound departure date: adult 12+, child 2-11, infant under 2 ' +
      '(no seat, 10% of the seat price). At least one adult, no more infants than adults. Extra bags: up to the airline\'s ' +
      "maximum per passenger, each up to the flight's maximum bag weight, charged per flight. The booking is saved as " +
      'Pending Payment and expires if not paid before holdExpiresAt. Prices are in cents.',
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
}
