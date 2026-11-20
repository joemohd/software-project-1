import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
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
import {
  ItineraryFlightSearchResponseDto,
  ItineraryIdParamDto,
  SearchItineraryFlightsQueryDto,
} from './dto/search-itinerary-flights.dto.js';
import { ItinerariesService } from './itineraries.service.js';

@ApiTags('Itineraries')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@Controller('itineraries')
export class ItinerariesController {
  constructor(private readonly itinerariesService: ItinerariesService) {}

  // GET /api/itineraries/:id/flights (ITN-26)
  @Get(':id/flights')
  @ApiOperation({
    summary: "Search one-way or round-trip flights to any airport in the city of the itinerary's first day (ITN-26)",
    description:
      "The outbound date defaults to the itinerary's startDate and the return date (for round-trip searches) defaults to the last day's date. Reuses FLT-11, FLT-12 and FLT-15 flight search.",
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiOkResponse({ type: ItineraryFlightSearchResponseDto })
  @ApiBadRequestResponse({
    description:
      'First day has no city; invalid originAirportId or origin in destination city; invalid dates; infants > adults; minPrice > maxPrice',
  })
  @ApiForbiddenResponse({ description: 'Private itinerary belonging to another user' })
  @ApiNotFoundResponse({ description: 'Itinerary not found' })
  searchFlights(
    @CurrentUser() user: AuthenticatedUser,
    @Param() params: ItineraryIdParamDto,
    @Query() query: SearchItineraryFlightsQueryDto,
  ): Promise<ItineraryFlightSearchResponseDto> {
    return this.itinerariesService.searchFlights(user, params.id, query);
  }
}
