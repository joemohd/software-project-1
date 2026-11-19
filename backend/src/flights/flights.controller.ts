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
import { CreateFlightDto } from './dto/create-flight.dto.js';
import { FlightResponseDto } from './dto/flight-response.dto.js';
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
}
