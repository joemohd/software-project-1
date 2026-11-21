import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AdminModerationController } from './admin-moderation.controller.js';
import { AdminModerationService } from './admin-moderation.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminService } from './admin.service.js';
import { ReportsController } from './reports.controller.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AdminUsersController, AdminModerationController, ReportsController],
  providers: [AdminService, AdminModerationService],
  exports: [AdminService, AdminModerationService],
})
export class AdminModule {}
