import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Patch, Post, Query, Res } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import {
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import authConfig from './auth.config.js';
import { clearAuthCookies, REFRESH_TOKEN_COOKIE, setAuthCookies } from './auth.helper.js';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './auth.types.js';
import { Cookie } from './decorators/cookie.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import { Public } from './decorators/public.decorator.js';
import {
  LoginResponseDto,
  MessageResponseDto,
  RegisterResponseDto,
  UserProfileDto,
} from './dto/auth-response.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailQueryDto } from './dto/verify-email.dto.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  // POST /api/auth/register (ACC-01)
  @Public()
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a new account (ACC-01)' })
  @ApiCreatedResponse({ type: RegisterResponseDto, description: 'Account created' })
  @ApiBadRequestResponse({ description: 'Invalid fields, weak password, consent not given, or unknown country' })
  @ApiConflictResponse({ description: 'Email or username already registered' })
  register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  // GET /api/auth/verify-email?token=... (ACC-02, optional)
  @Public()
  @Get('verify-email')
  @ApiOperation({ summary: 'Verify an email address from the emailed link (ACC-02)' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Link invalid or expired' })
  verifyEmail(@Query() query: VerifyEmailQueryDto): Promise<MessageResponseDto> {
    return this.authService.verifyEmail(query);
  }

  // POST /api/auth/login (ACC-04, ACC-05) - sets the auth cookies
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Log in (ACC-04, ACC-05)',
    description: 'Sets the access_token and refresh_token httpOnly cookies. Tokens are never returned in the body.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid email or password' })
  @ApiForbiddenResponse({ description: 'Account suspended or deactivated' })
  @ApiResponse({ status: HttpStatus.LOCKED, description: 'Locked for 15 minutes after 5 failed attempts' })
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) res: Response): Promise<LoginResponseDto> {
    const { user, tokens } = await this.authService.login(dto);
    setAuthCookies(res, tokens, this.config.cookieSecure);
    return { user };
  }

  // POST /api/auth/refresh (ACC-06, ACC-19) - called by the frontend when a request returns 401
  // Public because the access token has usually expired by then; the refresh cookie is the credential.
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get new tokens using the refresh_token cookie (ACC-06)',
    description: 'Rotates the refresh token. Call this when another request returns 401.',
  })
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Session expired or revoked; cookies are cleared' })
  @ApiForbiddenResponse({ description: 'Account suspended or deactivated' })
  async refresh(
    @Cookie(REFRESH_TOKEN_COOKIE) refreshToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<LoginResponseDto> {
    try {
      const { user, tokens } = await this.authService.refresh(refreshToken);
      setAuthCookies(res, tokens, this.config.cookieSecure);
      return { user };
    } catch (error) {
      clearAuthCookies(res, this.config.cookieSecure);
      throw error;
    }
  }

  // POST /api/auth/logout (ACC-06) - revokes the refresh token and clears the cookies
  // Public so a user whose access token already expired can still log out; it only affects the caller's own session.
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out: revokes the session and clears the cookies (ACC-06)' })
  @ApiOkResponse({ type: MessageResponseDto })
  async logout(
    @Cookie(REFRESH_TOKEN_COOKIE) refreshToken: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MessageResponseDto> {
    const result = await this.authService.logout(refreshToken);
    clearAuthCookies(res, this.config.cookieSecure);
    return result;
  }

  // POST /api/auth/forgot-password (ACC-07, optional)
  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a password-reset link by email (ACC-07)',
    description: 'Always returns the same message, whether or not the email is registered.',
  })
  @ApiOkResponse({ type: MessageResponseDto })
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    return this.authService.forgotPassword(dto);
  }

  // POST /api/auth/reset-password (ACC-07, optional) - Registered User (not logged in), uses the emailed token
  // Admin-initiated resets are ACC-07a: POST /api/admin/users/:id/reset-password (admin module)
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set a new password using the emailed reset token (ACC-07)' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Token invalid, expired or already used, or weak password' })
  resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    return this.authService.resetPassword(dto);
  }

  // PATCH /api/auth/change-password (ACC-08) - any authenticated user
  @Patch('change-password')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Change your password (ACC-08)', description: 'Signs out your other sessions.' })
  @ApiOkResponse({ type: MessageResponseDto })
  @ApiBadRequestResponse({ description: 'Current password incorrect, or new password invalid' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Cookie(REFRESH_TOKEN_COOKIE) refreshToken: string | undefined,
  ): Promise<MessageResponseDto> {
    return this.authService.changePassword(user, dto, refreshToken);
  }

  // GET /api/auth/me (ACC-04, ACC-19)
  @Get('me')
  @ApiCookieAuth()
  @ApiOperation({ summary: 'Get the logged-in user (ACC-19)' })
  @ApiOkResponse({ type: UserProfileDto })
  @ApiForbiddenResponse({ description: 'Account suspended, deactivated or required to change its password' })
  @ApiUnauthorizedResponse({ description: 'Not logged in' })
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return this.authService.me(user);
  }
}
