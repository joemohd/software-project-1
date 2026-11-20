import { Body, Controller, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiBadRequestResponse, ApiCookieAuth, ApiForbiddenResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiParam, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MessageResponseDto } from '../auth/dto/auth-response.dto.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { AdminService } from './admin.service.js';
import { ResetUserPasswordDto } from './dto/reset-user-password.dto.js';
import { UserIdParamDto } from './dto/user-id-param.dto.js';

@ApiTags('Admin')
@ApiCookieAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly adminService: AdminService) {}

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Reset a user's or moderator's password to a temporary password (ACC-07a)",
    description: 'Revokes existing sessions and reset links, requires a new password at the next login, and records an audit entry.',
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
}
