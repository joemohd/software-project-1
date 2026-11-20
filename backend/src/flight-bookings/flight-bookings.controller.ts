import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query, StreamableFile } from '@nestjs/common';
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
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { ChangeFlightDto, ChangeFlightResponseDto } from './dto/change-flight.dto.js';
import { CreateFlightBookingDto } from './dto/create-flight-booking.dto.js';
import {
  CancellationQuoteDto,
  CancelFlightBookingResponseDto,
  FlightBookingListResponseDto,
  FlightBookingResponseDto,
} from './dto/flight-booking-response.dto.js';
import { ListFlightBookingsQueryDto } from './dto/list-flight-bookings.dto.js';
import { SelectSeatDto } from './dto/select-seat.dto.js';
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

  // POST /api/flight-bookings/hold (FLT-22): the name used in the project's endpoint table; same as POST /api/flight-bookings
  @Post('hold')
  @ApiOperation({
    summary: 'Hold seats for 10 minutes as a Pending Payment booking (FLT-22)',
    description:
      'Same as POST /api/flight-bookings. Seats are reserved atomically only if enough remain, so concurrent requests never ' +
      'book more seats than exist. Unpaid holds expire after 10 minutes and the seats are released.',
  })
  @ApiCreatedResponse({ type: FlightBookingResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid body or passengers/baggage (see POST /api/flight-bookings)' })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiConflictResponse({ description: 'Flight not bookable, or not enough seats left' })
  hold(@CurrentUser('id') userId: string, @Body() dto: CreateFlightBookingDto): Promise<FlightBookingResponseDto> {
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

  // GET /api/flight-bookings/:id/e-ticket (FLT-23)
  @Get(':id/e-ticket')
  @ApiOperation({ summary: 'Download the e-ticket (PDF) of a confirmed booking' })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiProduces('application/pdf')
  @ApiOkResponse({ description: 'The e-ticket PDF', schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: "Booking not found (also when it is someone else's)" })
  @ApiConflictResponse({ description: 'Booking not confirmed yet' })
  async eTicket(@CurrentUser('id') userId: string, @Param('id') bookingId: string): Promise<StreamableFile> {
    const { fileName, pdf } = await this.flightBookingsService.eTicket(userId, bookingId);
    return new StreamableFile(pdf, { type: 'application/pdf', disposition: `attachment; filename="${fileName}"` });
  }

  // GET /api/flight-bookings/:id/cancellation (FLT-26): shown before the user confirms
  @Get(':id/cancellation')
  @ApiOperation({
    summary: 'See the refund you would get if you cancelled now',
    description: "Uses the airline's cancellation tiers (FLT-09) and the whole days left before the outbound departure.",
  })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: CancellationQuoteDto })
  @ApiNotFoundResponse({ description: "Booking not found (also when it is someone else's)" })
  cancellationQuote(@CurrentUser('id') userId: string, @Param('id') bookingId: string): Promise<CancellationQuoteDto> {
    return this.flightBookingsService.cancellationQuote(userId, bookingId);
  }

  // POST /api/flight-bookings/:id/cancel (FLT-26, PAY-03)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel your confirmed booking before departure and get the refund',
    description:
      'The booking becomes Cancelled, its seats return to sale, and the refund from the airline tiers is issued through ' +
      'Stripe (see GET /api/refunds/:id for its status). Not possible after departure.',
  })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: CancelFlightBookingResponseDto })
  @ApiNotFoundResponse({ description: "Booking not found (also when it is someone else's)" })
  @ApiConflictResponse({ description: 'Not Confirmed (pending, expired or already cancelled), or the flight has departed' })
  cancel(@CurrentUser('id') userId: string, @Param('id') bookingId: string): Promise<CancelFlightBookingResponseDto> {
    return this.flightBookingsService.cancel(userId, bookingId);
  }

  // PATCH /api/flight-bookings/:id/change-flight (FLT-27, optional)
  @Patch(':id/change-flight')
  @ApiOperation({
    summary: 'Change the date or flight of your confirmed booking (same route, cabin and airline)',
    description:
      'Moves one flight of the booking (segmentIndex 0 = outbound, 1 = return) to another flight on the same route, in the ' +
      'same cabin and with the same airline, for all passengers, subject to seat availability. A lower fare is applied at ' +
      'once and the difference refunded (see GET /api/refunds/:id). A higher fare returns outcome "payment_required": the ' +
      'new seats are held for 10 minutes and the change is applied only after Stripe confirms the difference was paid ' +
      '(confirm it with payment.clientSecret, or send testPaymentMethod "pm_card_visa" to pay right away in test mode). ' +
      'Until then the booking keeps its current flight. Prices are in cents.',
  })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: ChangeFlightResponseDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body, no return flight, same flight, different route or airline, cabin not on the new flight, round trip out ' +
      'of order, passenger type would change, bags over the new flight limits, or testPaymentMethod with a live key',
  })
  @ApiNotFoundResponse({ description: "Booking or new flight not found (also when the booking is someone else's)" })
  @ApiConflictResponse({
    description:
      'Booking not Confirmed, flight already departed, new flight not open, airline inactive, not enough seats, difference ' +
      'below 0.50 USD, or the booking changed at the same time',
  })
  changeFlight(
    @CurrentUser('id') userId: string,
    @Param('id') bookingId: string,
    @Body() dto: ChangeFlightDto,
  ): Promise<ChangeFlightResponseDto> {
    return this.flightBookingsService.changeFlight(userId, bookingId, dto);
  }

  // PATCH /api/flight-bookings/:id/seat (FLT-28)
  @Patch(':id/seat')
  @ApiOperation({
    summary: 'Select or change seat assignments on your flight booking (FLT-28)',
    description:
      'Assigns specific available seats in the booked cabin for one or more seated passengers on an outbound (segmentIndex 0) or return (segmentIndex 1) flight segment. ' +
      'Atomically reserves the new seat(s) on the flight and releases the previous seat(s). Infants travel on an adult\'s lap and have no seat.',
  })
  @ApiParam({ name: 'id', description: 'Booking id' })
  @ApiOkResponse({ type: FlightBookingResponseDto })
  @ApiBadRequestResponse({
    description: 'Invalid seat format, segmentIndex or passengerIndex out of range, infant passenger, duplicate seat, or seat not in the booked cabin',
  })
  @ApiNotFoundResponse({ description: "Booking not found (also when it is someone else's)" })
  @ApiConflictResponse({
    description: 'Booking not Confirmed or Pending Payment, flight already departed or not Scheduled, or the chosen seat is already taken',
  })
  selectSeat(
    @CurrentUser('id') userId: string,
    @Param('id') bookingId: string,
    @Body() dto: SelectSeatDto,
  ): Promise<FlightBookingResponseDto> {
    return this.flightBookingsService.selectSeat(userId, bookingId, dto);
  }
}
