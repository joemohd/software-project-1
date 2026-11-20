import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
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
import { UpdateAvailabilityDto } from './dto/update-availability.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';
import { UpdateHotelPoliciesDto } from './dto/update-hotel-policies.dto.js';
import { UpdateRoomDto } from './dto/update-room.dto.js';
import { HotelsService } from './hotels.service.js';

@ApiTags('Hotels')
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

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
  @ApiOkResponse({ type: HotelProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid id, invalid fields, city/country mismatch or empty update' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required' })
  @ApiNotFoundResponse({ description: 'Hotel not found or not assigned to you' })
  update(@CurrentUser() user: AuthenticatedUser, @Param() params: ProviderIdParamDto, @Body() dto: UpdateHotelDto): Promise<HotelProfileDto> {
    return this.hotelsService.update(user, params.id, dto);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'HTL-02: Get a hotel profile and rooms available for optional stay dates.' })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  getHotelDetails(@Param('id') hotelId: string, @Query() query: HotelDetailsQueryDto) {
    return this.hotelsService.getHotelDetails(hotelId, query);
  }

  @Post(':id/rooms')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  @ApiOperation({ summary: "HTL-03: Add a uniquely numbered room to the moderator's hotel." })
  createRoom(@Param('id') hotelId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: CreateRoomDto) {
    return this.hotelsService.createRoom(hotelId, user, dto);
  }

  @Post(':id/rooms/:roomId/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  @ApiOperation({ summary: 'HTL-04: Add a non-overlapping date range when a room can be booked.' })
  addAvailability(@Param('id') hotelId: string, @Param('roomId') roomId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: DateRangeDto) {
    return this.hotelsService.addAvailability(hotelId, roomId, user, dto);
  }

  @Patch(':id/rooms/:roomId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  updateRoom(@Param('id') hotelId: string, @Param('roomId') roomId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateRoomDto) {
    return this.hotelsService.updateRoom(hotelId, roomId, user, dto);
  }

  @Patch(':id/rooms/:roomId/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  updateAvailability(@Param('id') hotelId: string, @Param('roomId') roomId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateAvailabilityDto) {
    return this.hotelsService.updateAvailability(hotelId, roomId, user, dto);
  }

  @Delete(':id/rooms/:roomId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  deleteRoom(@Param('id') hotelId: string, @Param('roomId') roomId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.hotelsService.deleteRoom(hotelId, roomId, user);
  }

  @Get(':id/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  getAvailability(@Param('id') hotelId: string, @CurrentUser() user: AuthenticatedUser, @Query() query: AvailabilityQueryDto) {
    return this.hotelsService.getAvailability(hotelId, user, query);
  }

  @Put(':id/policies')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  updatePolicies(@Param('id') hotelId: string, @CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateHotelPoliciesDto) {
    return this.hotelsService.updatePolicies(hotelId, user, dto);
  }
}
