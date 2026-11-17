import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  // Auth tokens travel in httpOnly cookies (ACC-19)
  app.use(cookieParser());
  // Lets the frontend send those cookies on cross-origin requests
  app.enableCors({ origin: app.get(ConfigService).get<string>('auth.frontendUrl'), credentials: true });
  // Validates request bodies against DTO class-validator rules and rejects unknown fields
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
