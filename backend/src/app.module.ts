import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';

@Module({
  imports: [MongooseModule.forRoot(process.env.MONGODB_URI!)],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
