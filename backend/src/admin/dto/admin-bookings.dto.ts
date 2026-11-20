import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';
import { BookingStatus } from '../../database/schemas/expense.schema.js';
import { AdminProviderType } from './admin-accounts.dto.js';

const ISO_DATE_OR_DATETIME = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})?)?$/;

export enum AdminBookingType {
  FLIGHT = 'flight',
  HOTEL = 'hotel',
}

// ACC-17: query for GET /api/admin/bookings
export class ListAdminBookingsQueryDto {
  @ApiPropertyOptional({ description: 'Page number (10 items per page)', default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({ enum: AdminBookingType, description: 'Filter by booking type (flight or hotel)' })
  @IsOptional()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase().replace(/_booking$/, '').replace(/s$/, '') : value,
  )
  @IsEnum(AdminBookingType, { message: 'type must be "flight" or "hotel".' })
  type?: AdminBookingType;

  @ApiPropertyOptional({ enum: BookingStatus, description: 'Filter by booking status' })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;

  @ApiPropertyOptional({ description: 'Inclusive start date (YYYY-MM-DD or ISO-8601)', example: '2026-11-01' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_OR_DATETIME, { message: 'from must be a valid YYYY-MM-DD date or ISO-8601 timestamp.' })
  from?: string;

  @ApiPropertyOptional({ description: 'Inclusive end date (YYYY-MM-DD or ISO-8601)', example: '2026-12-31' })
  @IsOptional()
  @IsString()
  @Matches(ISO_DATE_OR_DATETIME, { message: 'to must be a valid YYYY-MM-DD date or ISO-8601 timestamp.' })
  to?: string;
}

export class AdminBookingUserDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345671' })
  id: string;

  @ApiProperty({ example: 'Mona Hassan' })
  fullName: string;

  @ApiProperty({ example: 'mona@example.com' })
  emailAddress: string;
}

export class AdminBookingProviderDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345678' })
  id: string;

  @ApiProperty({ enum: AdminProviderType, example: AdminProviderType.AIRLINE })
  type: AdminProviderType;

  @ApiProperty({ example: 'EgyptAir' })
  name: string;
}

export class AdminBookingDatesDto {
  @ApiProperty({ nullable: true, type: Date, example: '2026-12-01T08:00:00.000Z' })
  startDate: Date | null;

  @ApiProperty({ nullable: true, type: Date, example: '2026-12-01T19:30:00.000Z' })
  endDate: Date | null;
}

// ACC-17: one booking item in the admin read-only list
export class AdminBookingItemDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345699' })
  id: string;

  @ApiProperty({ enum: AdminBookingType, example: AdminBookingType.FLIGHT })
  type: AdminBookingType;

  @ApiProperty({ nullable: true, type: String, example: 'K7M2QX' })
  reference: string | null;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345671' })
  userId: string;

  @ApiProperty({ type: AdminBookingUserDto, nullable: true })
  user: AdminBookingUserDto | null;

  @ApiProperty({ type: AdminBookingProviderDto, nullable: true })
  provider: AdminBookingProviderDto | null;

  @ApiProperty({ type: AdminBookingDatesDto })
  dates: AdminBookingDatesDto;

  @ApiProperty({ description: 'Booking total in cents', example: 94500 })
  amount: number;

  @ApiProperty({ enum: BookingStatus, example: BookingStatus.CONFIRMED })
  status: BookingStatus;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  createdAt: Date;
}

// ACC-17, GEN-05: paginated list of bookings (10 per page)
export class AdminBookingsPageDto {
  @ApiProperty({ type: [AdminBookingItemDto] })
  items: AdminBookingItemDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;
}
