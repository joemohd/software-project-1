import { Body, Controller, Param, Patch, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ProviderIdParamDto } from '../common/providers/provider-id-param.dto.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { CreateHotelDto } from './dto/create-hotel.dto.js';
import { HotelProfileDto } from './dto/hotel-profile.dto.js';
import { UpdateHotelDto } from './dto/update-hotel.dto.js';
import { HotelsService } from './hotels.service.js';

@ApiTags('Hotels')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@Controller('hotels')
export class HotelsController {
  constructor(private readonly hotelsService: HotelsService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Create a hotel profile (HTL-01)' })
  @ApiCreatedResponse({ type: HotelProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid profile, moderator or city/country selection' })
  @ApiConflictResponse({ description: 'Moderator is already assigned to a provider' })
  @ApiForbiddenResponse({ description: 'Administrator access required' })
  create(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreateHotelDto): Promise<HotelProfileDto> {
    return this.hotelsService.create(admin, dto);
  }

  @Patch(':id')
  @Roles(UserRole.HOTEL_MODERATOR)
  @ApiOperation({ summary: 'Edit your assigned hotel profile (HTL-01)' })
  @ApiOkResponse({ type: HotelProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid id, invalid fields, city/country mismatch or empty update' })
  @ApiForbiddenResponse({ description: 'Hotel moderator access required' })
  @ApiNotFoundResponse({ description: 'Hotel not found or not assigned to you' })
  update(@CurrentUser() user: AuthenticatedUser, @Param() params: ProviderIdParamDto, @Body() dto: UpdateHotelDto): Promise<HotelProfileDto> {
    return this.hotelsService.update(user, params.id, dto);
  }
}
