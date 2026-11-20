import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import databaseConfig from './database/database.config.js';
import { DatabaseModule } from './database/database.module.js';
import { AuthModule } from './auth/auth.module.js';
import { UploadModule } from './common/upload/upload.module.js';
import { FlightsModule } from './flights/flights.module.js';
import { BlogModule } from './blog/blog.module.js';
import { AdminModule } from './admin/admin.module.js';
import { UsersModule } from './users/users.module.js';
import { HotelsModule } from './hotels/hotels.module.js';
import { AirlinesModule } from './airlines/airlines.module.js';
import { PaymentsModule } from './payments/payments.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [databaseConfig] }),
    DatabaseModule,
    AuthModule,
    UploadModule,
    FlightsModule,
    BlogModule,
    AdminModule,
    UsersModule,
    HotelsModule,
    AirlinesModule,
    PaymentsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
