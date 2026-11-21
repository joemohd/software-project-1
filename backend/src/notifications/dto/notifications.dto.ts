import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsMongoId, IsOptional, Min } from 'class-validator';
import { NotificationType } from '../../database/schemas/notification.schema.js';

const toBoolean = ({ value }: { value: unknown }) => {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
};

// GEN-01, GEN-05: query parameters for GET /api/notifications
export class ListNotificationsQueryDto {
  @ApiPropertyOptional({
    description: 'Page number (10 notifications per page, GEN-05)',
    default: 1,
    minimum: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'When true, returns only unread notifications (GEN-01)',
    example: false,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({
    enum: NotificationType,
    description: 'Optional filter by notification event type',
  })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

// GEN-01: route param for PATCH /api/notifications/:id/read
export class NotificationIdParamDto {
  @ApiProperty({ description: 'Notification id', example: '665f1c2e9b1e8a0012345690' })
  @IsMongoId()
  id: string;
}

// GEN-01: one in-app notification entry
export class NotificationItemDto {
  @ApiProperty({ example: '665f1c2e9b1e8a0012345690' })
  id: string;

  @ApiProperty({ example: '665f1c2e9b1e8a0012345674' })
  userId: string;

  @ApiProperty({ enum: NotificationType, example: NotificationType.BOOKING_CONFIRMED })
  type: NotificationType;

  @ApiProperty({ example: 'Flight booking confirmed' })
  title: string;

  @ApiProperty({ example: 'Your booking K7M2QX for MS 123 CAI -> JFK has been confirmed.' })
  message: string;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiProperty({ nullable: true, type: String, example: null })
  readAt: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: true,
    example: { bookingId: '665f1c2e9b1e8a0012345688', reference: 'K7M2QX' },
  })
  metadata: Record<string, unknown>;

  @ApiProperty({ example: '2026-11-20T12:00:00.000Z' })
  createdAt: string;
}

// GEN-01, GEN-05: paginated list of notifications (10 per page) with unread count
export class NotificationsPageDto {
  @ApiProperty({ type: [NotificationItemDto] })
  items: NotificationItemDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  pageSize: number;

  @ApiProperty({ example: 1 })
  total: number;

  @ApiProperty({ example: 1 })
  totalPages: number;

  @ApiProperty({ description: 'Total unread notifications for this user (GEN-01)', example: 1 })
  unreadCount: number;
}

// GEN-01: unread notification count response
export class UnreadNotificationCountDto {
  @ApiProperty({ description: 'Number of unread notifications (GEN-01)', example: 3 })
  unreadCount: number;
}

// GEN-01: mark all notifications read response
export class MarkAllNotificationsReadDto {
  @ApiProperty({ description: 'Number of notifications marked as read', example: 3 })
  markedReadCount: number;
}
