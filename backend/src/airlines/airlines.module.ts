import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AirlinesController } from './airlines.controller.js';
import { AirlinesService } from './airlines.service.js';

@Module({
  imports: [DatabaseModule],
  controllers: [AirlinesController],
  providers: [AirlinesService],
})
export class AirlinesModule {}
