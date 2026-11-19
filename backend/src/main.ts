import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';

/**
 * SUGGESTED main.ts — MERGE with your team's version. The hotel endpoints need:
 *   - app.setGlobalPrefix('api')      (all routes are /api/...)
 *   - a global ValidationPipe         (DTO validation)
 *   - cookieParser()                  (JWT is read from an httpOnly cookie)
 *   - CORS with credentials           (so the Next.js frontend can send the cookie)
 *   - Swagger at /api/docs            (Milestone 1 is graded through Swagger UI)
 */
async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');
  app.use(cookieParser());
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Travel Planning & Booking Platform API')
    .setDescription('Hotel search, bookings and reviews (HTL-11..26)')
    .setVersion('1.0')
    .addBearerAuth(
      { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      'access-token',
    )
    .addCookieAuth('access_token')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  await app.listen(process.env.PORT ?? 3000);
}
await bootstrap();
