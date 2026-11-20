import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
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
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ModeratedContentType } from '../database/schemas/report.schema.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { AdminModerationService } from './admin-moderation.service.js';
import { AuditLogsPageDto, ListAuditLogsQueryDto } from './dto/list-audit-logs.dto.js';
import {
  ContentParamDto,
  DeleteContentQueryDto,
  DeleteContentResponseDto,
  ListReportsQueryDto,
  ReportEntryDto,
  ReportIdParamDto,
  ReportsPageDto,
  ResolveReportDto,
} from './dto/reports.dto.js';

@ApiTags('Admin')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Administrator access required' })
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminModerationController {
  constructor(private readonly moderationService: AdminModerationService) {}

  // GET /api/admin/audit-logs (GEN-07)
  @Get('audit-logs')
  @ApiOperation({
    summary: 'List admin audit logs with optional filters, 10 per page (GEN-07)',
    description:
      'Returns the chronological audit trail of administrative actions (suspensions, password resets, report resolutions, content hiding and deletions), newest first.',
  })
  @ApiOkResponse({ type: AuditLogsPageDto })
  @ApiBadRequestResponse({ description: 'Invalid filter or date range (e.g. from > to)' })
  listAuditLogs(
    @CurrentUser() admin: AuthenticatedUser,
    @Query() query: ListAuditLogsQueryDto,
  ): Promise<AuditLogsPageDto> {
    return this.moderationService.listAuditLogs(admin, query);
  }

  // GET /api/admin/reports (GEN-09, GEN-10)
  @Get('reports')
  @ApiOperation({
    summary: 'List content reports (defaults to open reports), 10 per page (GEN-09, GEN-10)',
    description:
      'Lists user reports on posts, comments, reviews and itineraries with reporter details and a preview of the reported item.',
  })
  @ApiOkResponse({ type: ReportsPageDto })
  @ApiBadRequestResponse({ description: 'Invalid page or filter value' })
  listReports(
    @CurrentUser() admin: AuthenticatedUser,
    @Query() query: ListReportsQueryDto,
  ): Promise<ReportsPageDto> {
    return this.moderationService.listReports(admin, query);
  }

  // PATCH /api/admin/reports/:id (GEN-10)
  @Patch('reports/:id')
  @ApiOperation({
    summary: 'Resolve an open report by dismissing it, hiding the content or deleting it (GEN-10)',
    description:
      'Hiding content makes it visible only to its author and admins. Every resolution is recorded in the admin audit log (GEN-07).',
  })
  @ApiParam({ name: 'id', description: 'Id of the report to resolve' })
  @ApiOkResponse({ type: ReportEntryDto })
  @ApiBadRequestResponse({ description: 'Invalid report id or resolution body' })
  @ApiNotFoundResponse({ description: 'Report or reported content not found' })
  @ApiConflictResponse({ description: 'Report has already been resolved' })
  resolveReport(
    @CurrentUser() admin: AuthenticatedUser,
    @Param() params: ReportIdParamDto,
    @Body() dto: ResolveReportDto,
  ): Promise<ReportEntryDto> {
    return this.moderationService.resolveReport(admin, params.id, dto);
  }

  // DELETE /api/admin/content/:type/:id (GEN-10)
  @Delete('content/:type/:id')
  @ApiOperation({
    summary: 'Delete any post, comment, review or itinerary directly (GEN-10)',
    description:
      'Permanently deletes the target content item, cleans up dependent records (or recalculates hotel average rating for a review), resolves any open reports on the item, and writes an audit log entry (GEN-07).',
  })
  @ApiParam({ name: 'type', enum: ModeratedContentType, description: 'Content type (post, comment, review or itinerary)' })
  @ApiParam({ name: 'id', description: 'Id of the content item to delete' })
  @ApiOkResponse({ type: DeleteContentResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid content type or id' })
  @ApiNotFoundResponse({ description: 'Content item not found' })
  deleteContent(
    @CurrentUser() admin: AuthenticatedUser,
    @Param() params: ContentParamDto,
    @Query() query: DeleteContentQueryDto,
  ): Promise<DeleteContentResponseDto> {
    return this.moderationService.deleteContent(admin, params.type, params.id, query.reason);
  }
}
