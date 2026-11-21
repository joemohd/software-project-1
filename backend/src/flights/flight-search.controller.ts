import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import {
  FlightDetailsResponseDto,
  SearchFlightsQueryDto,
  SearchFlightsResponseDto,
} from './dto/search-flights.dto.js';
import { FlightSearchService } from './flight-search.service.js';

@ApiTags('Flights')
@Controller('flights')
export class FlightSearchController {
  constructor(private readonly flightSearchService: FlightSearchService) {}

  // GET /api/flights/search (FLT-11, FLT-12, FLT-15)
  @Public()
  @Get('search')
  @ApiOperation({
    summary: 'Search one-way or round-trip flights with passenger, cabin and price filters (FLT-11, FLT-12, FLT-15)',
    description:
      'Lists Scheduled flights of active airlines on the departure airport local date whose available seats (total - booked - held) cover the seated passengers (adults + children). Supports round-trip search, cabin filter, min/max price filter, and sorting by price, duration or departureTime.',
  })
  @ApiOkResponse({ type: SearchFlightsResponseDto })
  @ApiBadRequestResponse({
    description:
      'Invalid or identical airports; invalid date or returnDate < departureDate; infants > adults; minPrice > maxPrice',
  })
  search(@Query() query: SearchFlightsQueryDto): Promise<SearchFlightsResponseDto> {
    return this.flightSearchService.search(query);
  }

  // GET /api/flights/:id (FLT-17)
  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Get flight details with cabins, seats remaining, baggage allowance and cancellation policy (FLT-17)',
    description:
      'Shows airline profile, flight number, departure and arrival airports with local times and time zones, flight duration, each cabin category with price, seats remaining, baggage allowance and seat map, and the airline baggage and cancellation policies.',
  })
  @ApiParam({ name: 'id', description: 'Flight id' })
  @ApiOkResponse({ type: FlightDetailsResponseDto })
  @ApiNotFoundResponse({ description: 'Flight not found or airline deactivated' })
  getFlightDetails(@Param('id') flightId: string): Promise<FlightDetailsResponseDto> {
    return this.flightSearchService.getFlightDetails(flightId);
  }
}
