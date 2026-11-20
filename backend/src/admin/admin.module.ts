import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminService } from './admin.service.js';

@Module({
  imports: [DatabaseModule, AuthModule],
  controllers: [AdminUsersController],
  providers: [AdminService],
})
export class AdminModule {}
