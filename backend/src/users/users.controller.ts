import { Body, Controller, Delete, Get, Inject, Patch, Res } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { ApiBadRequestResponse, ApiConflictResponse, ApiCookieAuth, ApiForbiddenResponse, ApiOkResponse, ApiOperation, ApiTags, ApiUnauthorizedResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import authConfig from '../auth/auth.config.js';
import { clearAuthCookies } from '../auth/auth.helper.js';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { MessageResponseDto } from '../auth/dto/auth-response.dto.js';
import { UserRole } from '../database/schemas/user.schema.js';
import { DeactivateAccountDto } from './dto/deactivate-account.dto.js';
import { MyProfileDto } from './dto/my-profile.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';
import { UsersService } from './users.service.js';

@ApiTags('Users')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in or session revoked' })
@ApiForbiddenResponse({ description: 'Account suspended, deactivated or required to change its password' })
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  @Get('me')
  @ApiOperation({ summary: 'Get your own profile (ACC-11)' })
  @ApiOkResponse({ type: MyProfileDto })
  me(@CurrentUser() user: AuthenticatedUser): Promise<MyProfileDto> {
    return this.usersService.me(user);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Edit your name, phone number or preferred currency (ACC-09)' })
  @ApiOkResponse({ type: MyProfileDto })
  @ApiBadRequestResponse({ description: 'Invalid fields, unknown currency or empty update' })
  updateMe(@CurrentUser() user: AuthenticatedUser, @Body() dto: UpdateProfileDto): Promise<MyProfileDto> {
    return this.usersService.updateMe(user, dto);
  }

  @Delete('me')
  @Roles(UserRole.USER)
  @ApiOperation({
    summary: 'Deactivate your account after confirmation (ACC-12)',
    description: 'Requires confirm=true. Blocks accounts with upcoming or ongoing confirmed bookings. Hides public content, anonymizes the retained author name, revokes sessions and clears auth cookies.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Deactivation was not confirmed' })
  @ApiForbiddenResponse({ description: 'Only registered users may deactivate their own account' })
  @ApiConflictResponse({ description: 'The account has upcoming confirmed bookings' })
  async deactivateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeactivateAccountDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    const result = await this.usersService.deactivateMe(user, dto);
    clearAuthCookies(res, this.config.cookieSecure);
    return result;
  }
}
