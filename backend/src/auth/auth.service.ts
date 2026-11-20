import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { InjectModel } from '@nestjs/mongoose';
import { isValidObjectId, Model, Types } from 'mongoose';
import { Country } from '../database/schemas/country.schema.js';
import { PasswordResetToken } from '../database/schemas/password-reset-token.schema.js';
import { User, UserRole } from '../database/schemas/user.schema.js';
import authConfig from './auth.config.js';
import {
  accessTokenPayload,
  blockedStatusMessage,
  buildFrontendLink,
  clearedLoginAttempts,
  duplicateKeyMessage,
  EMAIL_VERIFICATION_TTL_SECONDS,
  emailVerificationPayload,
  expiryDate,
  failedLoginUpdate,
  generateToken,
  hashPassword,
  hashToken,
  isBlocked,
  isDuplicateKeyError,
  isExpired,
  LOCKOUT_MS,
  lockedException,
  lockoutRemainingMs,
  MESSAGES,
  normalizeEmail,
  normalizeUsername,
  PASSWORD_RESET_TTL_MS,
  passwordMatches,
  passwordResetEmail,
  toProfile,
  verificationEmail,
} from './auth.helper.js';
import type { AuthenticatedUser, AuthSession, EmailVerificationPayload, UserRecord } from './auth.types.js';
import { MessageResponseDto, RegisterResponseDto, UserProfileDto } from './dto/auth-response.dto.js';
import { ChangePasswordDto } from './dto/change-password.dto.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { VerifyEmailQueryDto } from './dto/verify-email.dto.js';
import { MailService } from './mail.service.js';
import { RefreshToken } from './schemas/refresh-token.schema.js';

@Injectable()
export class AuthService {
  // Checked against when the email is unknown, so response time doesn't reveal which emails are registered
  private readonly dummyPasswordHash = hashPassword(generateToken());

  constructor(
    @InjectModel(User.name) private readonly userModel: Model<User>,
    @InjectModel(Country.name) private readonly countryModel: Model<Country>,
    @InjectModel(PasswordResetToken.name) private readonly passwordResetTokenModel: Model<PasswordResetToken>,
    @InjectModel(RefreshToken.name) private readonly refreshTokenModel: Model<RefreshToken>,
    private readonly jwtService: JwtService,
    private readonly mailService: MailService,
    @Inject(authConfig.KEY) private readonly config: ConfigType<typeof authConfig>,
  ) {}

  // ACC-01
  async register(dto: RegisterDto): Promise<RegisterResponseDto> {
    const emailAddress = normalizeEmail(dto.emailAddress);
    const username = normalizeUsername(dto.username);
    //checks if the email and username are unique , and if the country exist or not.
    const [emailTaken, usernameTaken, countryExists] = await Promise.all([
      this.userModel.exists({ emailAddress }).exec(),
      this.userModel.exists({ username }).exec(),
      this.countryModel.exists({ _id: dto.countryOfOriginId }).exec(),
    ]);
    if (emailTaken) throw new ConflictException(MESSAGES.emailTaken);
    if (usernameTaken) throw new ConflictException(MESSAGES.usernameTaken);
    if (!countryExists) throw new BadRequestException(MESSAGES.unknownCountry);

    const user = await this.createUser({
      fullName: dto.fullName.trim(),
      emailAddress,
      username,
      passwordHash: await hashPassword(dto.password),
      phoneNumber: dto.phoneNumber,
      countryOfOriginId: new Types.ObjectId(dto.countryOfOriginId),
      role: UserRole.USER, // ACC-18: admins are seeded, never self-registered
      termsAcceptedAt: new Date(), // ACC-01: the DTO only lets the request through when acceptedTerms is true
    });

    const verificationToken = await this.jwtService.signAsync(emailVerificationPayload(user._id), {
      expiresIn: EMAIL_VERIFICATION_TTL_SECONDS,
    });
    const verificationLink = buildFrontendLink(this.config.frontendUrl, 'verify-email', verificationToken);
    // A failed email doesn't undo the registration; MailService logs the error
    await this.mailService.send(verificationEmail(user.emailAddress, user.fullName, verificationLink));

    return { user: toProfile(user) };
  }

  // ACC-02
  async verifyEmail(query: VerifyEmailQueryDto): Promise<MessageResponseDto> {
    const payload = await this.jwtService.verifyAsync<EmailVerificationPayload>(query.token).catch(() => null);
    if (payload?.type !== 'verify-email' || !isValidObjectId(payload.sub)) {
      throw new BadRequestException(MESSAGES.invalidVerificationLink);
    }

    const updated = await this.updateUser(payload.sub, { isVerified: true });
    if (!updated) throw new BadRequestException(MESSAGES.invalidVerificationLink);

    return { message: MESSAGES.emailVerified };
  }

  // ACC-04, ACC-05
  async login(dto: LoginDto): Promise<AuthSession> {
    const user = await this.userModel
      .findOne({ emailAddress: normalizeEmail(dto.emailAddress) })
      .select('+passwordHash')
      .lean<UserRecord>()
      .exec();

    if (!user?.passwordHash) {
      await passwordMatches(dto.password, await this.dummyPasswordHash);
      throw new UnauthorizedException(MESSAGES.invalidCredentials);
    }

    const lockRemaining = lockoutRemainingMs(user);
    if (lockRemaining > 0) throw lockedException(lockRemaining);

    if (!(await passwordMatches(dto.password, user.passwordHash))) {
      const update = failedLoginUpdate(user);// keep track of the number of failed login attempt
      await this.updateUser(user._id, update);// update the login attempts in user model
      throw update.loginAttemptsResetAt ? lockedException(LOCKOUT_MS) : new UnauthorizedException(MESSAGES.invalidCredentials);// if the account not locked it sends wrong credentials but if it looked it return the remainning time
    }

    // Checked only after the password, so the account status isn't revealed to someone guessing
    if (isBlocked(user.status)) throw new ForbiddenException(blockedStatusMessage(user.status));

    await this.updateUser(user._id, clearedLoginAttempts()); // ACC-05: success resets the counter

    // check if the user got susbended before and if so force the user to change password
    if (user.mustChangePassword) {
      if (!dto.newPassword) {
        throw new ForbiddenException({ message: MESSAGES.passwordChangeRequired, mustChangePassword: true });
      }
      if (await passwordMatches(dto.newPassword, user.passwordHash)) {
        throw new BadRequestException(MESSAGES.samePassword);
      }

      await this.updateUser(user._id, {
        passwordHash: await hashPassword(dto.newPassword),
        mustChangePassword: false,
      });
      await this.revokeSessions(user._id);
    }

    return this.createSession(user);
  }

  // ACC-06, ACC-19: exchanges a refresh token for new tokens (rotation: each refresh token works once)
  async refresh(refreshToken: string | undefined): Promise<AuthSession> {
    const session = refreshToken
      ? await this.refreshTokenModel.findOneAndDelete({ tokenHash: hashToken(refreshToken) }).lean().exec()
      : null;
    if (!session || isExpired(session.expiresAt)) throw new UnauthorizedException(MESSAGES.sessionExpired);

    const user = await this.userModel.findById(session.userId).lean<UserRecord>().exec();
    if (!user) throw new UnauthorizedException(MESSAGES.sessionExpired);
    if (isBlocked(user.status)) {
      await this.revokeSessions(user._id);
      throw new ForbiddenException(blockedStatusMessage(user.status));
    }
    if (user.mustChangePassword) {
      await this.revokeSessions(user._id);
      throw new ForbiddenException({ message: MESSAGES.passwordChangeRequired, mustChangePassword: true });
    }

    return this.createSession(user);
  }

  // ACC-06: revokes the refresh token on the server (the controller clears the cookies)
  async logout(refreshToken: string | undefined): Promise<MessageResponseDto> {
    if (refreshToken) await this.refreshTokenModel.deleteOne({ tokenHash: hashToken(refreshToken) }).exec();
    return { message: MESSAGES.loggedOut };
  }

  // ACC-07
  async forgotPassword(dto: ForgotPasswordDto): Promise<MessageResponseDto> {
    const user = await this.userModel
      .findOne({ emailAddress: normalizeEmail(dto.emailAddress) })
      .lean<UserRecord>()
      .exec();

    if (user && !isBlocked(user.status)) {
      const token = generateToken();
      // One token per user (userId is unique): a newer request replaces, and so invalidates, the previous link
      await this.passwordResetTokenModel
        .updateOne(
          { userId: user._id },
          { $set: { tokenHash: hashToken(token), expiresAt: expiryDate(PASSWORD_RESET_TTL_MS) } },
          { upsert: true },
        )
        .exec();

      const resetLink = buildFrontendLink(this.config.frontendUrl, 'reset-password', token);
      await this.mailService.send(passwordResetEmail(user.emailAddress, user.fullName, resetLink));
    }

    // Same answer either way, so this endpoint can't be used to discover registered emails
    return { message: MESSAGES.forgotPassword };
  }

  // ACC-07
  async resetPassword(dto: ResetPasswordDto): Promise<MessageResponseDto> {
    // Single-use: the token is deleted by the same query that finds it
    const resetToken = await this.passwordResetTokenModel
      .findOneAndDelete({ tokenHash: hashToken(dto.token) })
      .lean()
      .exec();
    if (!resetToken || isExpired(resetToken.expiresAt)) throw new BadRequestException(MESSAGES.invalidResetLink);

    const updated = await this.updateUser(resetToken.userId, {
      passwordHash: await hashPassword(dto.newPassword),
      mustChangePassword: false,
      ...clearedLoginAttempts(),
    });
    if (!updated) throw new BadRequestException(MESSAGES.invalidResetLink);

    await this.revokeSessions(resetToken.userId); // whoever had the old password is logged out
    return { message: MESSAGES.passwordReset };
  }

  // ACC-08
  async changePassword(
    user: AuthenticatedUser,
    dto: ChangePasswordDto,
    currentRefreshToken: string | undefined,
  ): Promise<MessageResponseDto> {
    const record = await this.userModel.findById(user.id).select('+passwordHash').lean<UserRecord>().exec();
    if (!record?.passwordHash) throw new UnauthorizedException(MESSAGES.sessionExpired);

    // 400, not 401: the user is still logged in, so the frontend must not treat this as a logout
    if (!(await passwordMatches(dto.currentPassword, record.passwordHash))) {
      throw new BadRequestException(MESSAGES.wrongCurrentPassword);
    }
    if (dto.currentPassword === dto.newPassword) throw new BadRequestException(MESSAGES.samePassword);

    await this.updateUser(record._id, {
      passwordHash: await hashPassword(dto.newPassword),
      mustChangePassword: false,
    });
    await this.revokeSessions(record._id, currentRefreshToken); // sign out every other session
    return { message: MESSAGES.passwordChanged };
  }

  // ACC-04, ACC-19
  async me(user: AuthenticatedUser): Promise<UserProfileDto> {
    const record = await this.userModel.findById(user.id).lean<UserRecord>().exec();
    if (!record) throw new UnauthorizedException(MESSAGES.sessionExpired);
    return toProfile(record);
  }

  /* ---------------------------------------------------------------- */
  /* Database helpers                                                 */
  /* ---------------------------------------------------------------- */

  /** Creates the user, turning a duplicate-key race into a 409. */
  private async createUser(fields: Partial<User>): Promise<UserRecord> {
    try {
      const document = await this.userModel.create(fields);
      return document.toObject<UserRecord>();
    } catch (error) {
      if (isDuplicateKeyError(error)) throw new ConflictException(duplicateKeyMessage(error));
      throw error;
    }
  }

  /** Sets fields on a user. Returns false if the user doesn't exist. */
  private async updateUser(userId: Types.ObjectId | string, fields: Partial<User>): Promise<boolean> {
    const result = await this.userModel.updateOne({ _id: userId }, { $set: fields }).exec();
    return result.matchedCount > 0;
  }

  /** Issues an access token and a new server-side refresh token (only its hash is stored). */
  private async createSession(user: UserRecord): Promise<AuthSession> {
    const refreshToken = generateToken();
    const [accessToken] = await Promise.all([
      this.jwtService.signAsync(accessTokenPayload(user._id, user.role, user.sessionVersion)),
      this.refreshTokenModel.create({
        userId: user._id,
        tokenHash: hashToken(refreshToken),
        expiresAt: expiryDate(this.config.refreshTokenIdleSeconds * 1000),
      }),
    ]);

    return {
      user: toProfile(user),
      tokens: {
        accessToken,
        accessTokenMaxAgeSeconds: this.config.jwtExpiresInSeconds,
        refreshToken,
        refreshTokenMaxAgeSeconds: this.config.refreshTokenIdleSeconds,
      },
    };
  }

  /** Deletes every session of a user, optionally keeping the one with `keepToken`. Returns how many were revoked. */
  private async revokeSessions(userId: Types.ObjectId, keepToken?: string): Promise<number> {
    const result = await this.refreshTokenModel
      .deleteMany({ userId, ...(keepToken && { tokenHash: { $ne: hashToken(keepToken) } }) })
      .exec();
    return result.deletedCount;
  }
}
