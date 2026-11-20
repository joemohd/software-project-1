import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiServiceUnavailableResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { BudgetSummaryService } from './budget-summary.service.js';
import { CreateActivityDto } from './dto/activity.dto.js';
import { CreateBudgetDto } from './dto/budget.dto.js';
import { CreateItineraryDto } from './dto/create-itinerary.dto.js';
import { CreateDayDto, ReorderDaysDto, UpdateDayDto } from './dto/day.dto.js';
import {
  BudgetSummaryDto,
  ItineraryDetailDto,
  ItineraryFlightSearchDto,
  ItineraryHotelSearchDto,
  ItineraryPageDto,
  PublicItineraryDto,
} from './dto/itinerary-response.dto.js';
import { ItineraryPageQueryDto } from './dto/pagination-query.dto.js';
import {
  BudgetSummaryQueryDto,
  ItineraryFlightsQueryDto,
  ItineraryHotelsQueryDto,
  PublicSearchQueryDto,
} from './dto/query.dto.js';
import { CreateTransportCostDto } from './dto/transport-cost.dto.js';
import { LinkBookingDto } from './dto/booking-link.dto.js';
import { UpdateItineraryDto } from './dto/update-itinerary.dto.js';
import { ItinerariesService } from './itineraries.service.js';
import { ItinerarySearchService } from './itinerary-search.service.js';
import { ItineraryPdfService } from './itinerary-pdf.service.js';
import { TravelerOnly } from './itinerary.decorators.js';
import { PublicItinerariesService } from './public-itineraries.service.js';

// Static paths ("public/...") are declared before ":id", and "days/reorder" before "days/:dayId",
// so they are not read as ids.
@ApiTags('Itineraries')
@Controller('itineraries')
export class ItinerariesController {
  constructor(
    private readonly itinerariesService: ItinerariesService,
    private readonly publicService: PublicItinerariesService,
    private readonly budgetSummaryService: BudgetSummaryService,
    private readonly searchService: ItinerarySearchService,
    private readonly pdfService: ItineraryPdfService,
  ) {}

  // ---- public (guests allowed) ----

  // GET /api/itineraries/public/search (ITN-20, ITN-21)
  @Public()
  @Get('public/search')
  @ApiOperation({
    summary: 'Search public itineraries (ITN-21)',
    description:
      'q matches the title, a country (name or code) or a city name. Filter by country code, city id and duration (minDays/maxDays). 10 per page, most recently updated first.',
  })
  @ApiOkResponse({ type: ItineraryPageDto })
  @ApiBadRequestResponse({ description: 'Invalid query.' })
  searchPublic(@Query() query: PublicSearchQueryDto): Promise<ItineraryPageDto> {
    return this.publicService.search(query);
  }

  // GET /api/itineraries/public/:id (ITN-21)
  @Public()
  @Get('public/:id')
  @ApiOperation({
    summary: 'View a public itinerary read-only, with author, days, activities and budget (ITN-21)',
    description: 'The budget is converted to ?currency (default USD).',
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiOkResponse({ type: PublicItineraryDto })
  @ApiNotFoundResponse({ description: 'Not found, private, hidden, or its author is deactivated.' })
  @ApiServiceUnavailableResponse({ description: 'Exchange rates unavailable and none cached.' })
  async viewPublic(
    @Param('id') itineraryId: string,
    @Query() query: BudgetSummaryQueryDto,
  ): Promise<PublicItineraryDto> {
    return this.publicService.view(itineraryId, await this.budgetSummaryService.resolveCurrency(query.currency));
  }

  // ---- owner routes ----

  // POST /api/itineraries (ITN-01)
  @Post()
  @TravelerOnly()
  @ApiOperation({ summary: 'Create an itinerary: title, countries, start date. Private by default (ITN-01)' })
  @ApiCreatedResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'Validation failed or unknown country code.' })
  create(@CurrentUser('id') userId: string, @Body() dto: CreateItineraryDto): Promise<ItineraryDetailDto> {
    return this.itinerariesService.create(userId, dto);
  }

  // GET /api/itineraries (ITN-03)
  @Get()
  @TravelerOnly()
  @ApiOperation({ summary: 'List my itineraries, most recently updated first, 10 per page (ITN-03)' })
  @ApiOkResponse({ type: ItineraryPageDto })
  listMine(@CurrentUser('id') userId: string, @Query() query: ItineraryPageQueryDto): Promise<ItineraryPageDto> {
    return this.itinerariesService.listMine(userId, query.page);
  }

  // GET /api/itineraries/:id (ITN-03)
  @Get(':id')
  @TravelerOnly()
  @ApiOperation({ summary: 'Open one of my itineraries with days, activities, budgets, transport and city groups (ITN-03, ITN-09)' })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiNotFoundResponse({ description: 'Not found or not yours.' })
  getMine(@CurrentUser('id') userId: string, @Param('id') itineraryId: string): Promise<ItineraryDetailDto> {
    return this.itinerariesService.getMine(userId, itineraryId);
  }

  // PATCH /api/itineraries/:id (ITN-01, ITN-20)
  @Patch(':id')
  @TravelerOnly()
  @ApiOperation({
    summary: 'Edit title, countries, start date or visibility (ITN-01, ITN-20)',
    description: 'Changing the start date shifts every day date. Public itineraries appear in public search; Private removes them immediately.',
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'Validation failed or unknown country code.' })
  @ApiNotFoundResponse({ description: 'Not found or not yours.' })
  update(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Body() dto: UpdateItineraryDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.update(userId, itineraryId, dto);
  }

  // DELETE /api/itineraries/:id (ITN-01)
  @Delete(':id')
  @TravelerOnly()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete my itinerary (ITN-01)',
    description: 'It disappears from public search; clones other users made earlier are not affected.',
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiNoContentResponse({ description: 'Deleted.' })
  @ApiNotFoundResponse({ description: 'Not found or not yours.' })
  remove(@CurrentUser('id') userId: string, @Param('id') itineraryId: string): Promise<void> {
    return this.itinerariesService.remove(userId, itineraryId);
  }

  // POST /api/itineraries/:id/clone (ITN-21)
  @Post(':id/clone')
  @TravelerOnly()
  @ApiOperation({
    summary: 'Clone a public itinerary into my own private, independent copy that credits the author (ITN-21)',
  })
  @ApiParam({ name: 'id', description: 'Public itinerary id' })
  @ApiCreatedResponse({ type: ItineraryDetailDto })
  @ApiNotFoundResponse({ description: 'Not found or not public.' })
  clone(@CurrentUser('id') userId: string, @Param('id') itineraryId: string): Promise<ItineraryDetailDto> {
    return this.publicService.clone(itineraryId, userId);
  }

  // ---- days ----

  // POST /api/itineraries/:id/days (ITN-05)
  @Post(':id/days')
  @TravelerOnly()
  @ApiOperation({ summary: 'Add a day at the end, with a city and notes. At most 60 days (ITN-05, ITN-09)' })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiCreatedResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'Unknown city or 60-day limit reached.' })
  @ApiNotFoundResponse({ description: 'Itinerary not found or not yours.' })
  addDay(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Body() dto: CreateDayDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.addDay(userId, itineraryId, dto);
  }

  // PATCH /api/itineraries/:id/days/reorder (ITN-08)
  @Patch(':id/days/reorder')
  @TravelerOnly()
  @ApiOperation({ summary: 'Move a day to a new position; numbers, dates and city groups are recalculated (ITN-08)' })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'newPosition out of range.' })
  @ApiNotFoundResponse({ description: 'Itinerary or day not found.' })
  reorderDays(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Body() dto: ReorderDaysDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.reorderDays(userId, itineraryId, dto);
  }

  // PATCH /api/itineraries/:id/days/:dayId (ITN-05)
  @Patch(':id/days/:dayId')
  @TravelerOnly()
  @ApiOperation({ summary: "Edit a day's city or notes (ITN-05)" })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiParam({ name: 'dayId', description: 'Day id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiNotFoundResponse({ description: 'Itinerary or day not found.' })
  updateDay(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Param('dayId') dayId: string,
    @Body() dto: UpdateDayDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.updateDay(userId, itineraryId, dayId, dto);
  }

  // DELETE /api/itineraries/:id/days/:dayId (ITN-07)
  @Delete(':id/days/:dayId')
  @TravelerOnly()
  @ApiOperation({
    summary: 'Delete a day; the remaining days are renumbered and dates and budget totals recalculated (ITN-07)',
    description: "The day's activities, budget entries and transport costs are deleted with it.",
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiParam({ name: 'dayId', description: 'Day id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiNotFoundResponse({ description: 'Itinerary or day not found.' })
  deleteDay(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Param('dayId') dayId: string,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.deleteDay(userId, itineraryId, dayId);
  }

  // POST /api/itineraries/:id/days/:dayId/activities (ITN-10)
  @Post(':id/days/:dayId/activities')
  @TravelerOnly()
  @ApiOperation({ summary: 'Add an activity to a day: name, description, optional time and cost (ITN-10)' })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiParam({ name: 'dayId', description: 'Day id' })
  @ApiCreatedResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'Validation failed (cost needs a currency).' })
  @ApiNotFoundResponse({ description: 'Itinerary or day not found.' })
  addActivity(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreateActivityDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.addActivity(userId, itineraryId, dayId, dto);
  }

  // POST /api/itineraries/:id/days/:dayId/budgets (ITN-14)
  @Post(':id/days/:dayId/budgets')
  @TravelerOnly()
  @ApiOperation({ summary: 'Add a non-negative budget entry (food, accommodation, in-city transport, activities) to a day (ITN-14)' })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiParam({ name: 'dayId', description: 'Day id' })
  @ApiCreatedResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'Validation failed or unsupported currency.' })
  @ApiNotFoundResponse({ description: 'Itinerary or day not found.' })
  addBudget(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Param('dayId') dayId: string,
    @Body() dto: CreateBudgetDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.addBudget(userId, itineraryId, dayId, dto);
  }

  // POST /api/itineraries/:id/transport-costs (ITN-16)
  @Post(':id/transport-costs')
  @TravelerOnly()
  @ApiOperation({ summary: 'Add an intercity transport cost: mode, from/to city, amount, currency, day (ITN-16)' })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiCreatedResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'Validation failed, unknown city or unsupported currency.' })
  @ApiNotFoundResponse({ description: 'Itinerary or day not found.' })
  addTransportCost(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Body() dto: CreateTransportCostDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.addTransportCost(userId, itineraryId, dto);
  }

  // POST /api/itineraries/:id/bookings (ITN-27)
  @Post(':id/bookings')
  @TravelerOnly()
  @ApiOperation({
    summary: 'Link one of your booked flights or hotels to a day of the itinerary (ITN-27)',
    description:
      'Only your own Confirmed or Completed bookings. Linked bookings appear on the day and feed the budget summary in the platform currency (not converted, PAY-04).',
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiCreatedResponse({ type: ItineraryDetailDto })
  @ApiBadRequestResponse({ description: 'The booking is not Confirmed or Completed.' })
  @ApiNotFoundResponse({ description: 'Itinerary, day or booking not found, or not yours.' })
  @ApiConflictResponse({ description: 'Already linked to this itinerary.' })
  linkBooking(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Body() dto: LinkBookingDto,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.linkBooking(userId, itineraryId, dto);
  }

  // DELETE /api/itineraries/:id/bookings/:bookingId (ITN-27)
  @Delete(':id/bookings/:bookingId')
  @TravelerOnly()
  @ApiOperation({ summary: 'Unlink a booking from the itinerary; the booking itself is not changed (ITN-27)' })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiParam({ name: 'bookingId', description: 'Linked booking id' })
  @ApiOkResponse({ type: ItineraryDetailDto })
  @ApiNotFoundResponse({ description: 'Itinerary not found, or the booking is not linked to it.' })
  unlinkBooking(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Param('bookingId') bookingId: string,
  ): Promise<ItineraryDetailDto> {
    return this.itinerariesService.unlinkBooking(userId, itineraryId, bookingId);
  }

  // GET /api/itineraries/:id/budget-summary (ITN-14, ITN-18)
  @Get(':id/budget-summary')
  @TravelerOnly()
  @ApiOperation({
    summary: 'Total budget by category, by day and by city group, converted to one currency (ITN-14, ITN-18)',
    description:
      "Converted to ?currency, else your preferred currency, else USD. Rates come from FXRatesAPI once per day and are cached; if the API is down the last cached rates are used (rateSource = 'cached').",
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiOkResponse({ type: BudgetSummaryDto })
  @ApiBadRequestResponse({ description: 'Invalid or unsupported currency code.' })
  @ApiNotFoundResponse({ description: 'Not found or not yours.' })
  @ApiServiceUnavailableResponse({ description: 'No exchange rates available (API down and nothing cached).' })
  async budgetSummary(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Query() query: BudgetSummaryQueryDto,
  ): Promise<BudgetSummaryDto> {
    const itinerary = await this.itinerariesService.findOwned(userId, itineraryId);
    const currency = await this.budgetSummaryService.resolveCurrency(query.currency, userId);
    return this.budgetSummaryService.summarize(itinerary, currency);
  }

  // GET /api/itineraries/:id/pdf (ITN-28)
  @Get(':id/pdf')
  @TravelerOnly()
  @ApiProduces('application/pdf')
  @ApiOperation({
    summary: 'Export or print my itinerary as a PDF (ITN-28)',
    description:
      'Days, activities, budget entries, transport costs, linked bookings and the budget total in your preferred currency. In Swagger, use "Download file" on the response.',
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiOkResponse({ description: 'The itinerary as a PDF file.', schema: { type: 'string', format: 'binary' } })
  @ApiNotFoundResponse({ description: 'Not found or not yours.' })
  exportPdf(@CurrentUser('id') userId: string, @Param('id') itineraryId: string): Promise<StreamableFile> {
    return this.pdfService.export(userId, itineraryId);
  }

  // GET /api/itineraries/:id/hotels (ITN-25)
  @Get(':id/hotels')
  @TravelerOnly()
  @ApiOperation({
    summary: 'Hotel search for one city group of the itinerary (ITN-25)',
    description:
      'Check-in = date of the group\'s first day, check-out = the day after its last day. Returns the criteria and the hotel search (HTL-11) request to run.',
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiOkResponse({ type: ItineraryHotelSearchDto })
  @ApiNotFoundResponse({ description: 'Itinerary or city group not found.' })
  hotels(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Query() query: ItineraryHotelsQueryDto,
  ): Promise<ItineraryHotelSearchDto> {
    return this.searchService.hotels(userId, itineraryId, query);
  }

  // GET /api/itineraries/:id/flights (ITN-26)
  @Get(':id/flights')
  @TravelerOnly()
  @ApiOperation({
    summary: "Flight search from an origin airport to the first day's city (ITN-26)",
    description:
      "Outbound date defaults to the start date and return date to the last day's date. Returns the criteria and one flight search (FLT-11, FLT-12) request per destination airport.",
  })
  @ApiParam({ name: 'id', description: 'Itinerary id' })
  @ApiOkResponse({ type: ItineraryFlightSearchDto })
  @ApiBadRequestResponse({ description: 'Unknown origin airport, no days yet, or return before outbound.' })
  @ApiNotFoundResponse({ description: "Itinerary not found, or the first day's city has no airport." })
  flights(
    @CurrentUser('id') userId: string,
    @Param('id') itineraryId: string,
    @Query() query: ItineraryFlightsQueryDto,
  ): Promise<ItineraryFlightSearchDto> {
    return this.searchService.flights(userId, itineraryId, query);
  }
}
