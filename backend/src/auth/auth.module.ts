import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { MongooseModule } from '@nestjs/mongoose';
import { DatabaseModule } from '../database/database.module.js';
import authConfig from './auth.config.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { RefreshToken, RefreshTokenSchema } from './schemas/refresh-token.schema.js';

@Module({
  imports: [
    DatabaseModule,
    MongooseModule.forFeature([{ name: RefreshToken.name, schema: RefreshTokenSchema }]),
    ConfigModule.forFeature(authConfig),
    JwtModule.registerAsync({
      imports: [ConfigModule.forFeature(authConfig)],
      inject: [authConfig.KEY],
      useFactory: (config: ConfigType<typeof authConfig>) => {
        if (!config.jwtSecret) throw new Error('JWT_SECRET environment variable is not set.');
        return {
          secret: config.jwtSecret,
          signOptions: { expiresIn: config.jwtExpiresInSeconds },
        };
      },
    }),
  ],
  providers: [
    AuthService,
    // Global guards run in registration order: authenticate first, then check roles.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  controllers: [AuthController],
  exports: [JwtModule],
})
export class AuthModule {}
