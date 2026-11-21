import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
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
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ProviderIdParamDto } from '../common/providers/provider-id-param.dto.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { DateRangeDto } from './dto/date-range.dto.js';
import { HotelDetailsQueryDto } from './dto/hotel-details-query.dto.js';
import { HotelProfileDto } from './dto/hotel-profile.dto.js';
import {
  AvailableRoomsResponseDto,
  DeleteRoomResponseDto,
  HotelAvailabilityResponseDto,
  HotelDetailsResponseDto,
  HotelPoliciesResponseDto,
  HotelReviewsPageDto,
  ModeratorReservationsPageDto,
  RoomResponseDto,
  SearchHotelsResponseDto,
} from './dto/hotel-responses.dto.js';
import { UpdateAvailabilityDto } from './dto/update-availability.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';
import { UpdateHotelPoliciesDto } from './dto/update-hotel-policies.dto.js';
import { UpdateRoomDto } from './dto/update-room.dto.js';
import { SearchHotelsDto } from './dto/search-hotels.dto.js';
import { AvailableRoomsQueryDto } from './dto/available-rooms-query.dto.js';
import { ListReservationsDto } from './dto/list-reservations.dto.js';
import { ListHotelReviewsDto } from './dto/list-hotel-reviews.dto.js';
import { HotelsService } from './hotels.service.js';

@ApiTags('Hotels')
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) { }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Create a hotel profile (HTL-01)' })
  @ApiCreatedResponse({ type: HotelProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid profile, moderator or city/country selection' })
  @ApiConflictResponse({ description: 'Moderator is already assigned to a provider' })
  @ApiForbiddenResponse({ description: 'Administrator access required' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  create(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreateHotelDto): Promise<HotelProfileDto> {
    return this.hotelsService.create(admin, dto);
  }

  @Patch(':id')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Edit your assigned hotel profile (HTL-01)' })
  @ApiParam({ name: 'id', description: 'Hotel ObjectId' })
  @ApiOkResponse({ type: HotelProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid id, invalid fields, city/country mismatch or empty update' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required' })
  @ApiNotFoundResponse({ description: 'Hotel not found or not assigned to you' })
  update(@CurrentUser() user: AuthenticatedUser, @Param() params: ProviderIdParamDto, @Body() dto: UpdateHotelDto): Promise<HotelProfileDto> {
    return this.hotelsService.update(user, params.id, dto);
  }

  // NOTE: `search` must be declared before `:id` so it is not captured by the :id route.
  @Public()
  @Get('search')
  @ApiOperation({ summary: 'HTL-11 / HTL-12: search, filter and sort hotels for a stay.' })
  @ApiOkResponse({ type: SearchHotelsResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid search dates (checkOut not after checkIn, or checkIn in the past) or invalid filter parameters' })
  searchHotels(@Query() query: SearchHotelsDto): Promise<SearchHotelsResponseDto> {
    return this.hotelsService.searchHotels(query);
  }

  @Public()
  @Get(':id/rooms/available')
  @ApiOperation({ summary: "HTL-15: a hotel's rooms free for the searched dates." })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiOkResponse({ type: AvailableRoomsResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid dates (checkOut not after checkIn, or checkIn in the past) or invalid guests count' })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  availableRooms(@Param('id') hotelId: string, @Query() query: AvailableRoomsQueryDto): Promise<AvailableRoomsResponseDto> {
    return this.hotelsService.availableRooms(hotelId, query);
  }

  @Public()
  @Get(':id/reviews')
  @ApiOperation({ summary: "HTL-24: a hotel's rating and reviews (newest first, paginated)." })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiOkResponse({ type: HotelReviewsPageDto })
  @ApiBadRequestResponse({ description: 'Invalid pagination parameters' })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  listReviews(@Param('id') hotelId: string, @Query() query: ListHotelReviewsDto): Promise<HotelReviewsPageDto> {
    return this.hotelsService.listHotelReviews(hotelId, query);
  }

  @Get(':id/reservations')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: "HTL-22: hotel moderator views their hotel's reservations." })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiOkResponse({ type: ModeratorReservationsPageDto })
  @ApiBadRequestResponse({ description: 'Invalid status filter or pagination parameters' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required, or not your hotel' })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  reservations(
    @Param('id') hotelId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: ListReservationsDto,
  ): Promise<ModeratorReservationsPageDto> {
    return this.hotelsService.reservationsForHotel(hotelId, user, query);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'HTL-02: Get a hotel profile and rooms available for optional stay dates.' })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiOkResponse({ type: HotelDetailsResponseDto })
  @ApiBadRequestResponse({ description: 'checkIn and checkOut must be supplied together, with checkOut after checkIn' })
  @ApiNotFoundResponse({ description: 'Hotel not found or deactivated' })
  getHotelDetails(@Param('id') hotelId: string, @Query() query: HotelDetailsQueryDto): Promise<HotelDetailsResponseDto> {
    return this.hotelsService.getHotelDetails(hotelId, query);
  }

  @Post(':id/rooms')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: "HTL-03: Add a uniquely numbered room to the moderator's hotel." })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiCreatedResponse({ type: RoomResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid room fields (number, type, bedCount, maxOccupancy, or pricePerNight)' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required, or not your hotel' })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  @ApiConflictResponse({ description: 'A room with this number already exists in this hotel' })
  createRoom(@Param('id') hotelId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoomDto): Promise<RoomResponseDto> {
    return this.hotelsService.createRoom(hotelId, user, dto);
  }

  @Post(':id/rooms/:roomId/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'HTL-04: Add a non-overlapping date range when a room can be booked.' })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiCreatedResponse({ type: RoomResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid date range (endDate must be after startDate)' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required, or not your hotel' })
  @ApiNotFoundResponse({ description: 'Hotel or room not found' })
  @ApiConflictResponse({ description: 'Date range overlaps an existing availability period' })
  addAvailability(@Param('id') hotelId: string, @Param('roomId') roomId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: DateRangeDto): Promise<RoomResponseDto> {
    return this.hotelsService.addAvailability(hotelId, roomId, user, dto);
  }

  @Patch(':id/rooms/:roomId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: "HTL-05 / HTL-06: Edit a room's beds, occupancy, price, status, or bookable date ranges." })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiOkResponse({ type: RoomResponseDto })
  @ApiBadRequestResponse({ description: 'Empty update or invalid room fields' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required, or not your hotel' })
  @ApiNotFoundResponse({ description: 'Hotel or room not found' })
  @ApiConflictResponse({ description: 'Overlapping date ranges, or removing availability / deactivating a room with a Confirmed or Pending Payment reservation' })
  updateRoom(@Param('id') hotelId: string, @Param('roomId') roomId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateRoomDto): Promise<RoomResponseDto> {
    return this.hotelsService.updateRoom(hotelId, roomId, user, dto);
  }

  @Patch(':id/rooms/:roomId/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'HTL-05 / HTL-06: Block or unblock a date range for a room.' })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiOkResponse({ type: RoomResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid date range or action' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required, or not your hotel' })
  @ApiNotFoundResponse({ description: 'Hotel or room not found' })
  @ApiConflictResponse({ description: 'Cannot block dates overlapping a Confirmed or Pending Payment reservation' })
  updateAvailability(@Param('id') hotelId: string, @Param('roomId') roomId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateAvailabilityDto): Promise<RoomResponseDto> {
    return this.hotelsService.updateAvailability(hotelId, roomId, user, dto);
  }

  @Delete(':id/rooms/:roomId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'HTL-06: Delete a room that has never been reserved.' })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiParam({ name: 'roomId', description: 'Room ID' })
  @ApiOkResponse({ type: DeleteRoomResponseDto })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required, or not your hotel' })
  @ApiNotFoundResponse({ description: 'Hotel or room not found' })
  @ApiConflictResponse({ description: 'A room that has been reserved cannot be deleted (deactivate it instead)' })
  deleteRoom(@Param('id') hotelId: string, @Param('roomId') roomId: string, @CurrentUser() user: AuthenticatedUser): Promise<DeleteRoomResponseDto> {
    return this.hotelsService.deleteRoom(hotelId, roomId, user);
  }

  @Get(':id/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: "HTL-08: View each room's status (available, booked with reference, or blocked) for a date range." })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiOkResponse({ type: HotelAvailabilityResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid startDate or endDate (endDate must be after startDate)' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required, or not your hotel' })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  getAvailability(@Param('id') hotelId: string, @CurrentUser() user: AuthenticatedUser, @Query() query: AvailabilityQueryDto): Promise<HotelAvailabilityResponseDto> {
    return this.hotelsService.getAvailability(hotelId, user, query);
  }

  @Put(':id/policies')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: "HTL-09 / HTL-10: Set the hotel's standard check-in/check-out times and cancellation refund tiers." })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  @ApiOkResponse({ type: HotelPoliciesResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid check-in/check-out time format or duplicate cancellation tier thresholds' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required, or not your hotel' })
  @ApiNotFoundResponse({ description: 'Hotel not found' })
  updatePolicies(@Param('id') hotelId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateHotelPoliciesDto): Promise<HotelPoliciesResponseDto> {
    return this.hotelsService.updatePolicies(hotelId, user, dto);
  }
}
