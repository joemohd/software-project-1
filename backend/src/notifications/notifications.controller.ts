import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiCookieAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import {
  ListNotificationsQueryDto,
  MarkAllNotificationsReadDto,
  NotificationIdParamDto,
  NotificationItemDto,
  NotificationsPageDto,
  UnreadNotificationCountDto,
} from './dto/notifications.dto.js';
import { NotificationsService } from './notifications.service.js';

// GEN-01, GEN-01-B: in-app notifications (unread count, list, mark as read) paired with SMTP email delivery.
@ApiTags('Notifications')
@ApiCookieAuth()
@ApiUnauthorizedResponse({ description: 'Not logged in' })
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  // GET /api/notifications (GEN-01, GEN-05)
  @Get()
  @ApiOperation({
    summary: 'List your in-app notifications, 10 per page (GEN-01, GEN-01-B)',
    description:
      'Returns paginated in-app notifications for booking confirmations, cancellations and refunds, flight schedule changes, and account or provider suspensions. Every GEN-01 notification is also sent by email over SMTP (using a test inbox in development when SMTP_HOST is not set, GEN-01-B).',
  })
  @ApiOkResponse({ type: NotificationsPageDto })
  @ApiBadRequestResponse({ description: 'Invalid page or filter parameters' })
  list(
    @CurrentUser('id') userId: string,
    @Query() query: ListNotificationsQueryDto,
  ): Promise<NotificationsPageDto> {
    return this.notificationsService.listForUser(userId, query);
  }

  // GET /api/notifications/unread-count (GEN-01)
  @Get('unread-count')
  @ApiOperation({
    summary: 'Get your unread in-app notification count (GEN-01)',
  })
  @ApiOkResponse({ type: UnreadNotificationCountDto })
  getUnreadCount(@CurrentUser('id') userId: string): Promise<UnreadNotificationCountDto> {
    return this.notificationsService.getUnreadCount(userId);
  }

  // PATCH /api/notifications/read-all (GEN-01)
  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all of your unread notifications as read (GEN-01)',
  })
  @ApiOkResponse({ type: MarkAllNotificationsReadDto })
  markAllAsRead(@CurrentUser('id') userId: string): Promise<MarkAllNotificationsReadDto> {
    return this.notificationsService.markAllAsRead(userId);
  }

  // PATCH /api/notifications/:id/read (GEN-01)
  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark a notification as read (GEN-01)',
  })
  @ApiParam({ name: 'id', description: 'Notification id' })
  @ApiOkResponse({ type: NotificationItemDto })
  @ApiBadRequestResponse({ description: 'Invalid notification id' })
  @ApiNotFoundResponse({ description: "Notification not found (also when it belongs to another user)" })
  markAsRead(
    @CurrentUser('id') userId: string,
    @Param() params: NotificationIdParamDto,
  ): Promise<NotificationItemDto> {
    return this.notificationsService.markAsRead(userId, params.id);
  }
}
