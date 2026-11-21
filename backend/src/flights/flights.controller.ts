import { Body, Controller, Get, Header, HttpCode, HttpStatus, Param, Patch, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiBadRequestResponse,
  ApiProduces,
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
import { CabinType } from '../database/schemas/flight.schema.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { CreateCabinDto, CreateFlightDto } from './dto/create-flight.dto.js';
import { FlightBookingsQueryDto, FlightBookingsReportDto } from './dto/flight-bookings-report.dto.js';
import { FlightResponseDto } from './dto/flight-response.dto.js';
import { UpdateCabinDto } from './dto/update-cabin.dto.js';
import { UpdateFlightDto } from './dto/update-flight.dto.js';
import { FlightManifestService } from './flight-manifest.service.js';
import { FlightsService } from './flights.service.js';

@ApiTags('Flights')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@Roles(UserRole.AIRLINE_MODERATOR)
@Controller('flights')
export class FlightsController {
  constructor(
    private readonly flightsService: FlightsService,
    private readonly flightManifestService: FlightManifestService,
  ) {}

  // GET /api/flights/:id/bookings (FLT-29)
  @Get(':id/bookings')
  @ApiOperation({
    summary: "Your flight's Confirmed and Cancelled bookings, with seats remaining per cabin",
    description: 'Pending Payment and Expired bookings are left out. 10 per page, newest booking first. No passport numbers.',
  })
  @ApiParam({ name: 'id', description: 'Flight id' })
  @ApiOkResponse({ type: FlightBookingsReportDto })
  @ApiBadRequestResponse({ description: 'Invalid page number' })
  @ApiForbiddenResponse({ description: "Not a moderator, or not your airline's flight" })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  listBookings(
    @Param('id') flightId: string,
    @CurrentUser('id') moderatorId: string,
    @Query() query: FlightBookingsQueryDto,
  ): Promise<FlightBookingsReportDto> {
    return this.flightManifestService.listBookings(flightId, moderatorId, query);
  }

  // GET /api/flights/:id/passengers/export (FLT-29)
  @Get(':id/passengers/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiProduces('text/csv')
  @ApiOperation({
    summary: 'Download the passenger list of your flight as CSV',
    description:
      'One row per passenger of Confirmed and Cancelled bookings: reference, passenger name, type, cabin, seat, extra bags (count), status. ' +
      'No passport numbers. Cells starting with = + - @ or a tab are prefixed with a quote so spreadsheets do not run them.',
  })
  @ApiParam({ name: 'id', description: 'Flight id' })
  @ApiOkResponse({ description: 'CSV file (attachment)', schema: { type: 'string' } })
  @ApiForbiddenResponse({ description: "Not a moderator, or not your airline's flight" })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  async exportPassengers(
    @Param('id') flightId: string,
    @CurrentUser('id') moderatorId: string,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const { filename, csv } = await this.flightManifestService.exportPassengers(flightId, moderatorId);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return csv;
  }

  // POST /api/flights (FLT-03, FLT-04)
  @Post()
  @ApiOperation({
    summary: 'Create a Scheduled flight for your airline',
    description:
      "Times are local to each airport (its city's IANA time zone) and stored in UTC. Seats are generated from each cabin's rows and layout.",
  })
  @ApiCreatedResponse({ type: FlightResponseDto })
  @ApiBadRequestResponse({
    description:
      'Invalid body; same airports; unknown airport or city without a time zone; arrival not after departure; departure in the past; invalid cabins',
  })
  @ApiForbiddenResponse({ description: 'Not a moderator, not your airline, or the airline is deactivated' })
  @ApiNotFoundResponse({ description: 'Airline not found' })
  @ApiConflictResponse({ description: 'Flight number already used by this airline on that local departure date' })
  create(@CurrentUser('id') moderatorId: string, @Body() dto: CreateFlightDto): Promise<FlightResponseDto> {
    return this.flightsService.create(moderatorId, dto);
  }

  // PATCH /api/flights/:id (FLT-05)
  @Patch(':id')
  @ApiOperation({
    summary: 'Change departure/arrival times (and airports, until a seat is held or booked) (FLT-05)',
    description:
      "Local times as on creation. Changing an airport also needs that side's local time. A side whose time is not sent keeps its stored time. Any departure or arrival time change sends an in-app notification (GEN-01) and SMTP email notification (GEN-01-B) to passengers with Confirmed bookings (FLT-05).",
  })
  @ApiParam({ name: 'id', description: 'Flight id' })
  @ApiOkResponse({ type: FlightResponseDto })
  @ApiBadRequestResponse({
    description: 'Nothing to update, same airports, missing local time for a changed airport, invalid times, or a city without a time zone',
  })
  @ApiForbiddenResponse({ description: "Not a moderator, or not your airline's flight" })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiConflictResponse({
    description: 'Airports changed after a seat was held or booked, duplicate flight number on that date, flight not Scheduled or already departed',
  })
  update(
    @Param('id') flightId: string,
    @CurrentUser('id') moderatorId: string,
    @Body() dto: UpdateFlightDto,
  ): Promise<FlightResponseDto> {
    return this.flightsService.update(flightId, moderatorId, dto);
  }

  // POST /api/flights/:id/cancel (FLT-06)
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel a Scheduled flight (FLT-06)',
    description:
      'Sets the status to cancelled (hidden from search), releases all pending seat holds and expires Pending Payment bookings, transitions all Confirmed bookings on this flight to Cancelled with a 100% refund via Stripe (PAY-03), and sends in-app (GEN-01) and SMTP email (GEN-01-B) notifications to affected passengers.',
  })
  @ApiParam({ name: 'id', description: 'Flight id' })
  @ApiOkResponse({ type: FlightResponseDto })
  @ApiForbiddenResponse({ description: "Not a moderator, or not your airline's flight" })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiConflictResponse({ description: 'Flight not Scheduled (e.g. already cancelled) or already departed' })
  cancel(@Param('id') flightId: string, @CurrentUser('id') moderatorId: string): Promise<FlightResponseDto> {
    return this.flightsService.cancel(flightId, moderatorId);
  }

  // POST /api/flights/:id/cabins (FLT-04)
  @Post(':id/cabins')
  @ApiOperation({ summary: 'Add a cabin type the flight does not have yet (Scheduled flights only)' })
  @ApiParam({ name: 'id', description: 'Flight id' })
  @ApiCreatedResponse({ type: FlightResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid cabin, rows overlap another cabin, or free allowance above maxBagWeight' })
  @ApiForbiddenResponse({ description: "Not a moderator, or not your airline's flight" })
  @ApiNotFoundResponse({ description: 'Flight not found' })
  @ApiConflictResponse({ description: 'Cabin type already on the flight, flight not Scheduled or already departed, or it changed meanwhile' })
  addCabin(
    @Param('id') flightId: string,
    @CurrentUser('id') moderatorId: string,
    @Body() dto: CreateCabinDto,
  ): Promise<FlightResponseDto> {
    return this.flightsService.addCabin(flightId, moderatorId, dto);
  }

  // PATCH /api/flights/:id/cabins/:cabinId (FLT-05); cabins have no _id, so :cabinId is the cabin name
  @Patch(':id/cabins/:cabinId')
  @ApiOperation({
    summary: "Change a cabin's seat price and/or row range (Scheduled flights only)",
    description:
      'Added rows use the cabin\'s existing seat layout. Rows can only be removed if none of their seats is held or booked. Existing bookings keep their price.',
  })
  @ApiParam({ name: 'id', description: 'Flight id' })
  @ApiParam({ name: 'cabinId', enum: CabinType, description: 'Cabin name, e.g. "Premium Economy"' })
  @ApiOkResponse({ type: FlightResponseDto })
  @ApiBadRequestResponse({ description: 'Nothing to update, invalid values, or rows overlap another cabin' })
  @ApiForbiddenResponse({ description: "Not a moderator, or not your airline's flight" })
  @ApiNotFoundResponse({ description: 'Flight not found, or it has no such cabin' })
  @ApiConflictResponse({ description: 'Rows to remove have held/booked seats, flight not Scheduled or already departed, or it changed meanwhile' })
  updateCabin(
    @Param('id') flightId: string,
    @Param('cabinId') cabinName: string,
    @CurrentUser('id') moderatorId: string,
    @Body() dto: UpdateCabinDto,
  ): Promise<FlightResponseDto> {
    return this.flightsService.updateCabin(flightId, cabinName, moderatorId, dto);
  }
}
