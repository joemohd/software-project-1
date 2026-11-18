import { Body, Controller, Param, Put } from '@nestjs/common';
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
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { AirlinesService } from './airlines.service.js';
import { BaggagePolicyResponseDto, UpdateBaggagePolicyDto } from './dto/update-baggage-policy.dto.js';
import { CancellationPolicyResponseDto, UpdateCancellationPolicyDto } from './dto/update-cancellation-policy.dto.js';

@ApiTags('Airlines')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Not a moderator, or not the moderator of this airline' })
@ApiNotFoundResponse({ description: 'Airline not found' })
@ApiParam({ name: 'id', description: 'Airline id' })
@Roles(UserRole.MODERATOR)
@Controller('airlines')
export class AirlinesController {
  constructor(private readonly airlinesService: AirlinesService) {}

  // PUT /api/airlines/:id/baggage-policy (FLT-08)
  @Put(':id/baggage-policy')
  @ApiOperation({ summary: "Set your airline's extra-baggage price and per-passenger limit" })
  @ApiOkResponse({ type: BaggagePolicyResponseDto })
  @ApiBadRequestResponse({ description: 'Price not a whole number of cents > 0, or count < 0' })
  updateBaggagePolicy(
    @Param('id') airlineId: string,
    @CurrentUser('id') moderatorId: string,
    @Body() dto: UpdateBaggagePolicyDto,
  ): Promise<BaggagePolicyResponseDto> {
    return this.airlinesService.updateBaggagePolicy(airlineId, moderatorId, dto);
  }

  // PUT /api/airlines/:id/cancellation-policy (FLT-09)
  @Put(':id/cancellation-policy')
  @ApiOperation({ summary: "Replace your airline's cancellation refund tiers" })
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
