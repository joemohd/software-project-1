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
import { CreateHotelBookingDto } from './dto/create-hotel-booking.dto.js';
import { HotelBookingResponseDto } from './dto/hotel-booking-response.dto.js';
import { HotelBookingService } from './hotel-booking.service.js';

// HTL-16, HTL-18: registered users reserve hotel rooms (moderators and admins get 403).
// Booking creation route, hosted by the consolidated hotel-bookings module.
@ApiTags('Hotel bookings')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Not a registered user' })
@Roles(UserRole.USER)
@Controller('hotel-bookings')
export class HotelBookingController {
  constructor(private readonly hotelBookingService: HotelBookingService) {}

  // POST /api/hotel-bookings (HTL-16, HTL-18)
  @Post()
  @ApiOperation({
    summary: 'Reserve one or more rooms of a hotel and hold them for 10 minutes',
    description:
      'All rooms are in the same hotel for the same dates. Assign adults and children (ages 0-17) to each room: at least one ' +
      'adult in the booking, at least one guest per room, and no room over its maximum occupancy. Total = sum over rooms ' +
      'of nights x price per night (in cents, at booking time). The rooms are held together as one Pending Payment ' +
      'booking until holdExpiresAt; if any room is blocked or already booked or held for overlapping dates, nothing is ' +
      'held. Then accept the policies (POST /api/bookings/hotel/:id/accept-policies) and pay (POST /api/payments).',
  })
  @ApiCreatedResponse({ type: HotelBookingResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid body or dates, check-out not after check-in, check-in in the past, a room twice, a room with no guests, no adult, or too many guests for a room',
  })
  @ApiNotFoundResponse({ description: 'Hotel not found or not active, or a room not in this hotel' })
  @ApiConflictResponse({ description: 'A room is deactivated, blocked, or already booked or held for overlapping dates' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateHotelBookingDto): Promise<HotelBookingResponseDto> {
    return this.hotelBookingService.create(userId, dto);
  }
}
