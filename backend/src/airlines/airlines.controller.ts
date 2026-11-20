import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiCreatedResponse, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ProviderIdParamDto } from '../common/providers/provider-id-param.dto.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { AirlinesService } from './airlines.service.js';
import { AirlineProfileDto } from './dto/airline-profile.dto.js';
import { CreateAirlineDto } from './dto/create-airline.dto.js';
import { UpdateAirlineDto } from './dto/update-airline.dto.js';

@ApiTags('Airlines')
@Controller('airlines')
export class AirlinesController {
  constructor(private readonly airlinesService: AirlinesService) {}

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Create an airline profile (FLT-01)' })
  @ApiCreatedResponse({ type: AirlineProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid profile or moderator' })
  @ApiConflictResponse({ description: 'Airline code or moderator assignment already exists' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Administrator access required' })
  create(@CurrentUser() admin: AuthenticatedUser, @Body() dto: CreateAirlineDto): Promise<AirlineProfileDto> {
    return this.airlinesService.create(admin, dto);
  }

  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get an active airline profile (FLT-01)' })
  @ApiOkResponse({ type: AirlineProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid airline id' })
  @ApiNotFoundResponse({ description: 'Airline not found or deactivated' })
  findOne(@Param() params: ProviderIdParamDto): Promise<AirlineProfileDto> {
    return this.airlinesService.findOne(params.id);
  }

  @Patch(':id')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Edit your assigned airline profile (FLT-01)' })
  @ApiOkResponse({ type: AirlineProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid id, invalid fields or empty update' })
  @ApiConflictResponse({ description: 'Airline code already exists' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Airline moderator access required' })
  @ApiNotFoundResponse({ description: 'Airline not found or not assigned to you' })
  update(@CurrentUser() user: AuthenticatedUser, @Param() params: ProviderIdParamDto, @Body() dto: UpdateAirlineDto): Promise<AirlineProfileDto> {
    return this.airlinesService.update(user, params.id, dto);
  }
}
