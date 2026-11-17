import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Patch, Post, Query, Res } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
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
  register(@Body() dto: RegisterDto): Promise<RegisterResponseDto> {
    return this.authService.register(dto);
  }

  // GET /api/auth/verify-email?token=... (ACC-02, optional)
  @Public()
  @Get('verify-email')
  verifyEmail(@Query() query: VerifyEmailQueryDto): Promise<MessageResponseDto> {
    return this.authService.verifyEmail(query);
  }

  // POST /api/auth/login (ACC-04, ACC-05) - sets the auth cookies
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
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
  forgotPassword(@Body() dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    return this.authService.forgotPassword(dto);
  }

  // POST /api/auth/reset-password (ACC-07, optional) - Registered User (not logged in), uses the emailed token
  // Admin-initiated resets are ACC-07a: POST /api/admin/users/:id/reset-password (admin module)
  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto): Promise<MessageResponseDto> {
    return this.authService.resetPassword(dto);
  }

  // PATCH /api/auth/change-password (ACC-08) - any authenticated user
  @Patch('change-password')
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: ChangePasswordDto,
    @Cookie(REFRESH_TOKEN_COOKIE) refreshToken: string | undefined,
  ): Promise<MessageResponseDto> {
    return this.authService.changePassword(user, dto, refreshToken);
  }

  // GET /api/auth/me (ACC-04, ACC-19)
  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser): Promise<UserProfileDto> {
    return this.authService.me(user);
  }
}
