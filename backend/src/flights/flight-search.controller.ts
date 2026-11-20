import { Controller, Get, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator.js';
import { SearchFlightsQueryDto, SearchFlightsResponseDto } from './dto/search-flights.dto.js';
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
}
