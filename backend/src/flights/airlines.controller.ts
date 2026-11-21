import { Body, Controller, Get, Param, Put } from '@nestjs/common';
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
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Public } from '../auth/decorators/public.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { AirlinesService } from './airlines.service.js';
import { BaggagePolicyResponseDto, UpdateBaggagePolicyDto } from './dto/update-baggage-policy.dto.js';
import { CancellationPolicyResponseDto, UpdateCancellationPolicyDto } from './dto/update-cancellation-policy.dto.js';

@ApiTags('Airlines')
@ApiNotFoundResponse({ description: 'Airline not found' })
@ApiParam({ name: 'id', description: 'Airline id' })
@Controller('airlines')
export class AirlinesController {
  constructor(private readonly airlinesService: AirlinesService) {}

  // GET /api/airlines/:id/baggage-policy (FLT-08, FLT-17, PAY-02)
  @Public()
  @Get(':id/baggage-policy')
  @ApiOperation({ summary: "Get an airline's extra-baggage policy (FLT-08, FLT-17, PAY-02)" })
  @ApiOkResponse({ type: BaggagePolicyResponseDto })
  getBaggagePolicy(@Param('id') airlineId: string): Promise<BaggagePolicyResponseDto> {
    return this.airlinesService.getBaggagePolicy(airlineId);
  }

  // PUT /api/airlines/:id/baggage-policy (FLT-08)
  @Put(':id/baggage-policy')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiCookieAuth()
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Not a moderator, or not the moderator of this airline' })
  @ApiOperation({ summary: "Set your airline's extra-baggage price and per-passenger limit (FLT-08)" })
  @ApiOkResponse({ type: BaggagePolicyResponseDto })
  @ApiBadRequestResponse({ description: 'Price not a whole number of cents > 0, or count < 0' })
  updateBaggagePolicy(
    @Param('id') airlineId: string,
    @CurrentUser('id') moderatorId: string,
    @Body() dto: UpdateBaggagePolicyDto,
  ): Promise<BaggagePolicyResponseDto> {
    return this.airlinesService.updateBaggagePolicy(airlineId, moderatorId, dto);
  }

  // GET /api/airlines/:id/cancellation-policy (FLT-09, FLT-17, PAY-02)
  @Public()
  @Get(':id/cancellation-policy')
  @ApiOperation({ summary: "Get an airline's cancellation refund tiers (FLT-09, FLT-17, PAY-02)" })
  @ApiOkResponse({ type: CancellationPolicyResponseDto })
  getCancellationPolicy(@Param('id') airlineId: string): Promise<CancellationPolicyResponseDto> {
    return this.airlinesService.getCancellationPolicy(airlineId);
  }

  // PUT /api/airlines/:id/cancellation-policy (FLT-09)
  @Put(':id/cancellation-policy')
  @Roles(UserRole.AIRLINE_MODERATOR)
  @ApiCookieAuth()
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Not a moderator, or not the moderator of this airline' })
  @ApiOperation({ summary: "Replace your airline's cancellation refund tiers (FLT-09)" })
  @ApiOkResponse({ type: CancellationPolicyResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid tier, or duplicate daysBeforeDeparture' })
  updateCancellationPolicy(
    @Param('id') airlineId: string,
    @CurrentUser('id') moderatorId: string,
    @Body() dto: UpdateCancellationPolicyDto,
  ): Promise<CancellationPolicyResponseDto> {
    return this.airlinesService.updateCancellationPolicy(airlineId, moderatorId, dto);
  }
}
