import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsMongoId,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { IsStrongPassword } from '../../auth/dto/password.rules.js';
import { Trim } from '../../auth/dto/trim.transform.js';
import { ProviderStatus } from '../../database/schemas/provider.schema.js';
import { UserActivityStatus, UserRole } from '../../database/schemas/user.schema.js';

export const MODERATOR_ROLES = [UserRole.HOTEL_MODERATOR, UserRole.AIRLINE_MODERATOR] as const;
export type ModeratorRole = (typeof MODERATOR_ROLES)[number];

export enum AdminProviderType {
  AIRLINE = 'airline',
  HOTEL = 'hotel',
}

// ACC-13: body for POST /api/admin/moderators
export class CreateModeratorDto {
  @ApiProperty({ maxLength: 100, example: 'Karim Nabil' })
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  fullName: string;

  @ApiProperty({ maxLength: 254, example: 'moderator@example.com' })
  @Trim()
  @IsEmail()
  @MaxLength(254)
  emailAddress: string;

  @ApiProperty({
    enum: MODERATOR_ROLES,
    description: 'Moderator role: "hotel moderator" or "airline moderator"',
    example: UserRole.HOTEL_MODERATOR,
  })
  @IsIn(MODERATOR_ROLES, { message: 'role must be either "hotel moderator" or "airline moderator".' })
  role: ModeratorRole;

  @IsStrongPassword()
  temporaryPassword: string;

  @ApiPropertyOptional({
    description: 'Id of the hotel or airline to link this moderator to (must match role when provided)',
    example: '665f1c2e9b1e8a0012345678',
  })
  @IsOptional()
  @IsMongoId()
  providerId?: string;

  @ApiPropertyOptional({
    minLength: 3,
    maxLength: 30,
    description: 'Optional unique username; derived from emailAddress when omitted',
    example: 'karim.mod',
  })
  @IsOptional()
  @Trim()
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  @Matches(/^[a-zA-Z0-9._]+$/, {
    message: 'username may only contain letters, numbers, dots and underscores',
  })
  username?: string;

  @ApiPropertyOptional({ description: 'Optional E.164 phone number', example: '+201234567890' })
  @IsOptional()
  @Trim()
  @Matches(/^\+[1-9]\d{1,14}$/, { message: 'phoneNumber must be in E.164 format (e.g. +201234567890)' })
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Optional country id; defaults to a seeded country when omitted',
    example: '665f1c2e9b1e8a0012345670',
  })
  @IsOptional()
  @IsMongoId()
  countryOfOriginId?: string;
}

// ACC-14: query for GET /api/admin/accounts
export class ListAccountsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (10 items per page)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ description: 'Case-insensitive search by name or email', maxLength: 100 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(100)
  search?: string;

  @ApiPropertyOptional({ enum: UserRole, description: 'Filter by account role' })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserActivityStatus, description: 'Filter by account status' })
  @IsOptional()
  @IsEnum(UserActivityStatus)
  status?: UserActivityStatus;
}

// ACC-15, ACC-16: optional reason body for suspend/reactivate/deactivate actions
export class AdminReasonDto {
  @ApiPropertyOptional({ description: 'Optional reason recorded in the audit log', maxLength: 1000 })
  @IsOptional()
  @Trim()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

// ACC-15: path params for PATCH /api/admin/providers/:type/:id/deactivate and /reactivate
export class ProviderParamDto {
  @ApiProperty({ enum: AdminProviderType, description: 'Provider type: airline or hotel' })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase().replace(/s$/, '') : value))
  @IsEnum(AdminProviderType, { message: 'type must be "airline" or "hotel".' })
  type: AdminProviderType;

  @ApiProperty({ description: 'Id of the hotel or airline' })
  @IsMongoId()
  id: string;
}

// ACC-13, ACC-14, ACC-15, ACC-16: admin view of an account
export class AdminAccountDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345671' })
  id: string;

  @ApiProperty({ example: 'Karim Nabil' })
  fullName: string;

  @ApiProperty({ example: 'moderator@example.com' })
  emailAddress: string;

  @ApiProperty({ example: 'karim.mod' })
  username: string;

  @ApiProperty({ enum: UserRole, example: UserRole.HOTEL_MODERATOR })
  role: UserRole;

  @ApiProperty({ enum: UserActivityStatus, example: UserActivityStatus.ACTIVE })
  status: UserActivityStatus;

  @ApiProperty({ example: true })
  isVerified: boolean;

  @ApiProperty({ example: true })
  mustChangePassword: boolean;

  @ApiProperty({ nullable: true, type: String, example: '665f1c2e9b1e8a0012345678' })
  providerId: string | null;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  createdAt: Date;

  @ApiPropertyOptional({ example: 'Account has been suspended.' })
  message?: string;
}

// ACC-14, GEN-05: paginated list of accounts (10 per page)
export class AccountsPageDto {
  @ApiProperty({ type: [AdminAccountDto] })
  items: AdminAccountDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}

// ACC-15: response for provider deactivate / reactivate
export class AdminProviderStatusResponseDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  id: string;

  @ApiProperty({ enum: AdminProviderType, example: AdminProviderType.HOTEL })
  type: AdminProviderType;

  @ApiProperty({ example: 'Nile View Hotel' })
  name: string;

  @ApiProperty({ enum: ProviderStatus, example: ProviderStatus.DEACTIVATED })
  status: ProviderStatus;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345671' })
  moderatorId: string;

  @ApiProperty({ example: 'Hotel has been deactivated.' })
  message: string;
}
