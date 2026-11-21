import { Body, Controller, Post } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOperation,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { AdminModerationService } from './admin-moderation.service.js';
import { CreateReportDto, ReportEntryDto } from './dto/reports.dto.js';

// GEN-09: registered users report a post, comment, review or itinerary with a reason (at most once per item).
@ApiTags('Reports')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Registered user access required' })
@Roles(UserRole.USER)
@Controller('reports')
export class ReportsController {
  constructor(private readonly moderationService: AdminModerationService) {}

  // POST /api/reports (GEN-09)
  @Post()
  @ApiOperation({
    summary: 'Report a post, comment, review or itinerary with a reason (GEN-09)',
    description:
      'A registered user may report a post, comment, review or itinerary at most once per item. Administrators review open reports under GET /api/admin/reports (GEN-10).',
  })
  @ApiCreatedResponse({ type: ReportEntryDto })
  @ApiBadRequestResponse({ description: 'Invalid targetType, targetId or empty/overlong reason' })
  @ApiNotFoundResponse({ description: 'Target post, comment, review or itinerary not found' })
  @ApiConflictResponse({ description: 'You have already reported this item' })
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateReportDto,
  ): Promise<ReportEntryDto> {
    return this.moderationService.createReport(user, dto);
  }
}
