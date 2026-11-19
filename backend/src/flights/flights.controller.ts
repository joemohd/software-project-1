import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
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
import { CabinType } from '../database/schemas/flight.schema.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { CreateCabinDto, CreateFlightDto } from './dto/create-flight.dto.js';
import { FlightResponseDto } from './dto/flight-response.dto.js';
import { UpdateCabinDto } from './dto/update-cabin.dto.js';
import { FlightsService } from './flights.service.js';

@ApiTags('Flights')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@Roles(UserRole.MODERATOR)
@Controller('flights')
export class FlightsController {
  constructor(private readonly flightsService: FlightsService) {}

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
