import { Body, Controller, Get, HttpCode, HttpStatus, Param, Patch, Post, Query } from '@nestjs/common';
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
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MessageResponseDto } from '../auth/dto/auth-response.dto.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { AdminService } from './admin.service.js';
import {
  AccountsPageDto,
  AdminAccountDto,
  AdminProviderStatusResponseDto,
  AdminProviderType,
  AdminReasonDto,
  CreateModeratorDto,
  ListAccountsQueryDto,
  ProviderParamDto,
} from './dto/admin-accounts.dto.js';
import { AdminBookingsPageDto, ListAdminBookingsQueryDto } from './dto/admin-bookings.dto.js';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto.js';
import { UserIdParamDto } from './dto/user-id-param.dto.js';

@ApiTags('Admin')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@ApiForbiddenResponse({ description: 'Administrator access required' })
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminUsersController {
  constructor(private readonly adminService: AdminService) {}

  // POST /api/admin/users/:id/reset-password (ACC-07a)
  @Post('users/:id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reset a user's or moderator's password to a temporary password (ACC-07a)",
    description: 'Revokes existing sessions and reset links, and requires a new password at the next login.',
  })
  @ApiParam({ name: 'id', description: 'Id of the user or moderator' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid account id or weak temporary password' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  @ApiForbiddenResponse({ description: 'Administrator access required, or target is an admin' })
  @ApiNotFoundResponse({ description: 'Account not found' })
  resetUserPassword(
    @CurrentUser() admin: AuthenticatedUser,
    @Param() params: UserIdParamDto,
    @Body() dto: ResetUserPasswordDto,
  ): Promise<MessageResponseDto> {
    return this.adminService.resetUserPassword(admin, params.id, dto);
  }

  // POST /api/admin/moderators (ACC-13)
  @Post('moderators')
  @ApiOperation({
    summary: 'Create a hotel or airline moderator account with a temporary password (ACC-13)',
    description:
      'Creates a hotel or airline moderator account linked to one hotel or airline (when providerId is provided), sets mustChangePassword=true for first login, sends an invitation email (GEN-01-B) and logs the action (GEN-07).',
  })
  @ApiCreatedResponse({ type: AdminAccountDto })
  @ApiBadRequestResponse({ description: 'Invalid body, role, weak temporary password, or mismatched provider type' })
  @ApiNotFoundResponse({ description: 'Hotel or airline not found' })
  @ApiConflictResponse({ description: 'Email or username is already registered' })
  createModerator(
    @CurrentUser() admin: AuthenticatedUser,
    @Body() dto: CreateModeratorDto,
  ): Promise<AdminAccountDto> {
    return this.adminService.createModerator(admin, dto);
  }

  // GET /api/admin/accounts (ACC-14)
  @Get('accounts')
  @ApiOperation({
    summary: 'List all accounts with search by name or email and filter by role and status, 10 per page (ACC-14)',
    description:
      'Returns a paginated list of all user, moderator and admin accounts (name, email, role, status, registration date), newest first.',
  })
  @ApiOkResponse({ type: AccountsPageDto })
  @ApiBadRequestResponse({ description: 'Invalid page, role or status filter' })
  listAccounts(
    @CurrentUser() admin: AuthenticatedUser,
    @Query() query: ListAccountsQueryDto,
  ): Promise<AccountsPageDto> {
    return this.adminService.listAccounts(admin, query);
  }

  // PATCH /api/admin/accounts/:id/suspend (ACC-15, ACC-16)
  @Patch('accounts/:id/suspend')
  @ApiOperation({
    summary: 'Suspend a registered user or moderator account (ACC-15, ACC-16)',
    description:
      'Blocks the account from logging in, revokes its active sessions and refresh tokens, notifies the account holder and writes an audit log entry (GEN-07). Existing confirmed bookings remain valid.',
  })
  @ApiParam({ name: 'id', description: 'Id of the user or moderator account to suspend' })
  @ApiOkResponse({ type: AdminAccountDto })
  @ApiBadRequestResponse({ description: 'Invalid account id or reason' })
  @ApiForbiddenResponse({ description: 'Administrator access required, or target is an administrator' })
  @ApiNotFoundResponse({ description: 'Account not found' })
  @ApiConflictResponse({ description: 'Account is already suspended or deactivated' })
  suspendAccount(
    @CurrentUser() admin: AuthenticatedUser,
    @Param() params: UserIdParamDto,
    @Body() dto: AdminReasonDto,
  ): Promise<AdminAccountDto> {
    return this.adminService.suspendAccount(admin, params.id, dto);
  }

  // PATCH /api/admin/accounts/:id/reactivate (ACC-15, ACC-16)
  @Patch('accounts/:id/reactivate')
  @ApiOperation({
    summary: 'Reactivate a suspended user or moderator account (ACC-15, ACC-16)',
    description:
      'Restores a suspended account to active status, clears any login lockout, notifies the account holder and writes an audit log entry (GEN-07).',
  })
  @ApiParam({ name: 'id', description: 'Id of the suspended user or moderator account to reactivate' })
  @ApiOkResponse({ type: AdminAccountDto })
  @ApiBadRequestResponse({ description: 'Invalid account id or reason' })
  @ApiForbiddenResponse({ description: 'Administrator access required, or target is an administrator' })
  @ApiNotFoundResponse({ description: 'Account not found' })
  @ApiConflictResponse({ description: 'Account is already active or was self-deactivated' })
  reactivateAccount(
    @CurrentUser() admin: AuthenticatedUser,
    @Param() params: UserIdParamDto,
    @Body() dto: AdminReasonDto,
  ): Promise<AdminAccountDto> {
    return this.adminService.reactivateAccount(admin, params.id, dto);
  }

  // PATCH /api/admin/providers/:type/:id/deactivate (ACC-15)
  @Patch('providers/:type/:id/deactivate')
  @ApiOperation({
    summary: 'Deactivate a hotel or airline (ACC-15)',
    description:
      'Hides the provider and its listings from public search and blocks new bookings while keeping existing confirmed bookings valid. Notifies the assigned moderator and writes an audit log entry (GEN-07).',
  })
  @ApiParam({ name: 'type', enum: AdminProviderType, description: 'Provider type: airline or hotel' })
  @ApiParam({ name: 'id', description: 'Id of the hotel or airline to deactivate' })
  @ApiOkResponse({ type: AdminProviderStatusResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid provider type, id or reason' })
  @ApiNotFoundResponse({ description: 'Hotel or airline not found' })
  @ApiConflictResponse({ description: 'Provider is already deactivated' })
  deactivateProvider(
    @CurrentUser() admin: AuthenticatedUser,
    @Param() params: ProviderParamDto,
    @Body() dto: AdminReasonDto,
  ): Promise<AdminProviderStatusResponseDto> {
    return this.adminService.deactivateProvider(admin, params.type, params.id, dto);
  }

  // PATCH /api/admin/providers/:type/:id/reactivate (ACC-15)
  @Patch('providers/:type/:id/reactivate')
  @ApiOperation({
    summary: 'Reactivate a deactivated hotel or airline (ACC-15)',
    description:
      'Restores the provider to active status so its listings appear in search and can be booked again. Notifies the assigned moderator and writes an audit log entry (GEN-07).',
  })
  @ApiParam({ name: 'type', enum: AdminProviderType, description: 'Provider type: airline or hotel' })
  @ApiParam({ name: 'id', description: 'Id of the hotel or airline to reactivate' })
  @ApiOkResponse({ type: AdminProviderStatusResponseDto })
  @ApiBadRequestResponse({ description: 'Invalid provider type, id or reason' })
  @ApiNotFoundResponse({ description: 'Hotel or airline not found' })
  @ApiConflictResponse({ description: 'Provider is already active' })
  reactivateProvider(
    @CurrentUser() admin: AuthenticatedUser,
    @Param() params: ProviderParamDto,
    @Body() dto: AdminReasonDto,
  ): Promise<AdminProviderStatusResponseDto> {
    return this.adminService.reactivateProvider(admin, params.type, params.id, dto);
  }

  // GET /api/admin/bookings (ACC-17)
  @Get('bookings')
  @ApiOperation({
    summary: 'List all flight and hotel bookings (read-only), filterable by type, status and date range, 10 per page (ACC-17)',
    description:
      'Returns a paginated, read-only list of all flight bookings and hotel reservations showing reference, user, provider, dates, amount and status.',
  })
  @ApiOkResponse({ type: AdminBookingsPageDto })
  @ApiBadRequestResponse({ description: 'Invalid filter or date range (e.g. from > to)' })
  listBookings(
    @CurrentUser() admin: AuthenticatedUser,
    @Query() query: ListAdminBookingsQueryDto,
  ): Promise<AdminBookingsPageDto> {
    return this.adminService.listBookings(admin, query);
  }
}
