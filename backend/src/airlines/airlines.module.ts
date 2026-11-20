import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AuditLog, AuditLogSchema } from '../admin/schemas/audit-log.schema.js';
import { DatabaseModule } from '../database/database.module.js';
import { AirlinesController } from './airlines.controller.js';
import { AirlinesService } from './airlines.service.js';

@Module({
  imports: [DatabaseModule, MongooseModule.forFeature([{ name: AuditLog.name, schema: AuditLogSchema }])],
  controllers: [AirlinesController],
  providers: [AirlinesService],
})
export class AirlinesModule {}
