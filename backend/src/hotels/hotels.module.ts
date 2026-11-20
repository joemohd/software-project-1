import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from '../admin/schemas/audit-log.schema.js';
import { DatabaseModule } from '../database/database.module.js';
import { HotelsController } from './hotels.controller.js';
import { HotelsService } from './hotels.service.js';

@Module({
  imports: [DatabaseModule, MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }])],
  controllers: [HotelsController],
  providers: [HotelsService],
})
export class HotelsModule {}
