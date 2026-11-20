import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import {
  ApiCookieAuth,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { AvailabilityQueryDto } from './dto/availability-query.dto.js';
import { CreateRoomDto } from './dto/create-room.dto.js';
import { DateRangeDto } from './dto/date-range.dto.js';
import { HotelDetailsQueryDto } from './dto/hotel-details-query.dto.js';
import { UpdateAvailabilityDto } from './dto/update-availability.dto.js';
import { UpdateHotelPoliciesDto } from './dto/update-hotel-policies.dto.js';
import { UpdateRoomDto } from './dto/update-room.dto.js';
import { HotelsService } from './hotels.service.js';

@ApiTags('Hotels')
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Public()
  @Get(':id')
  @ApiOperation({
    summary:
      'HTL-02: Get a hotel profile and rooms available for optional stay dates.',
  })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  getHotelDetails(
    @Param('id') hotelId: string,
    @Query() query: HotelDetailsQueryDto,
  ) {
    return this.hotelsService.getHotelDetails(hotelId, query);
  }

  @Post(':id/rooms')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  @ApiOperation({
    summary: "HTL-03: Add a uniquely numbered room to the moderator's hotel.",
  })
  @ApiParam({ name: 'id', description: 'Hotel ID' })
  createRoom(
    @Param('id') hotelId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateRoomDto,
  ) {
    return this.hotelsService.createRoom(hotelId, user, dto);
  }

  @Post(':id/rooms/:roomId/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  @ApiOperation({
    summary:
      'HTL-04: Add a non-overlapping date range when a room can be booked.',
  })
  addAvailability(
    @Param('id') hotelId: string,
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DateRangeDto,
  ) {
    return this.hotelsService.addAvailability(hotelId, roomId, user, dto);
  }

  @Patch(':id/rooms/:roomId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  @ApiOperation({
    summary:
      "HTL-05: Edit beds, occupancy, price, status, or the room's bookable ranges.",
  })
  updateRoom(
    @Param('id') hotelId: string,
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateRoomDto,
  ) {
    return this.hotelsService.updateRoom(hotelId, roomId, user, dto);
  }

  @Patch(':id/rooms/:roomId/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  @ApiOperation({
    summary: 'HTL-05/HTL-06: Block or unblock a room date range.',
  })
  updateAvailability(
    @Param('id') hotelId: string,
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateAvailabilityDto,
  ) {
    return this.hotelsService.updateAvailability(hotelId, roomId, user, dto);
  }

  @Delete(':id/rooms/:roomId')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  @ApiOperation({
    summary: 'HTL-06: Delete a room that has never been reserved.',
  })
  deleteRoom(
    @Param('id') hotelId: string,
    @Param('roomId') roomId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.hotelsService.deleteRoom(hotelId, roomId, user);
  }

  @Get(':id/availability')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  @ApiOperation({
    summary:
      'HTL-08: View each room as Available, Booked, or Blocked for a date range.',
  })
  getAvailability(
    @Param('id') hotelId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: AvailabilityQueryDto,
  ) {
    return this.hotelsService.getAvailability(hotelId, user, query);
  }

  @Put(':id/policies')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiCookieAuth('access-token')
  @ApiOperation({
    summary:
      'HTL-09/HTL-10: Set check-in/out times and unique cancellation tiers.',
  })
  updatePolicies(
    @Param('id') hotelId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: UpdateHotelPoliciesDto,
  ) {
    return this.hotelsService.updatePolicies(hotelId, user, dto);
  }
}
