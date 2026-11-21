import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ACCESS_TOKEN_COOKIE } from './auth/auth.helper.js';

async function bootstrap() {
    // rawBody: the Stripe webhook (PAY-01) checks its signature against the exact bytes Stripe sent
    const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });

    // Cleanly close the HTTP server, Mongoose connection and background sweepers on SIGTERM/SIGINT (e.g. nest start --watch restarts)
    app.enableShutdownHooks();

    app.setGlobalPrefix('api');

    // Authentication cookies are HttpOnly
    app.use(cookieParser());

    // Lets the frontend send those cookies on cross-origin requests
    app.enableCors({
        origin: app.get(ConfigService).get<string>('auth.frontendUrl'),
        credentials: true
    });

    // Validates request bodies against DTO class-validator rules and rejects unknown fields
    app.useGlobalPipes(new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true
    }));
    
    // Swagger UI at /api/docs; authenticated calls use the access-token cookie set by POST /api/auth/login
    const swaggerConfig = new DocumentBuilder()
        .setTitle('Travel Planning and Booking API')
        .setVersion('1.0')
        .addCookieAuth(ACCESS_TOKEN_COOKIE)
        .build();
    SwaggerModule.setup('api/docs', app, () => SwaggerModule.createDocument(app, swaggerConfig), {
        swaggerOptions: { withCredentials: true, persistAuthorization: true },
        // Hide the documented "Responses" table (Code / Description / Links) under each endpoint;
        // the real server response shown after "Execute" stays visible
        customCss: `
            .swagger-ui .responses-inner > table.responses-table { display: none; }
            .swagger-ui .responses-inner > div > h4 { display: none; }
        `
    });

    await app.listen(process.env.PORT ?? 3000);
}

await bootstrap();
