import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import * as yaml from 'js-yaml';
import { AdminModerationController } from './admin/admin-moderation.controller.js';
import { AdminUsersController } from './admin/admin-users.controller.js';
import { ReportsController } from './admin/reports.controller.js';
import { AirlinesController as AirlinesProfileController } from './airlines/airlines.controller.js';
import { ACCESS_TOKEN_COOKIE } from './auth/auth.helper.js';
import { AuthController } from './auth/auth.controller.js';
import { AuthorsController } from './blog/authors.controller.js';
import { BlogController } from './blog/blog.controller.js';
import { CommentsController } from './blog/comments.controller.js';
import { TagsController } from './blog/tags.controller.js';
import { UploadController } from './common/upload/upload.controller.js';
import { FlightBookingsController } from './flight-bookings/flight-bookings.controller.js';
import { AirlinesController as AirlinesPoliciesController } from './flights/airlines.controller.js';
import { AirportsController } from './flights/airports.controller.js';
import { FlightSearchController } from './flights/flight-search.controller.js';
import { FlightsController } from './flights/flights.controller.js';
import { HotelBookingController } from './hotel-bookings/hotel-booking.controller.js';
import { HotelBookingsController } from './hotel-bookings/hotel-bookings.controller.js';
import { ReviewsController } from './hotel-bookings/reviews.controller.js';
import { HotelsController } from './hotels/hotels.controller.js';
import { ItinerariesController } from './itineraries/itineraries.controller.js';
import {
  ActivitiesController,
  BudgetsController,
  TransportCostsController,
} from './itineraries/itinerary-items.controller.js';
import { NotificationsController } from './notifications/notifications.controller.js';
import {
  BookingPoliciesController,
  PaymentsController,
  PaymentsWebhookController,
  RefundsController,
} from './payments/payments.controller.js';
import { UsersController } from './users/users.controller.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const openapiPath = resolve(currentDir, 'openapi.yaml');

describe('OpenAPI specification completeness and contract alignment', () => {
  let app: INestApplication;
  let document: OpenAPIObject;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AuthController,
        UsersController,
        AdminUsersController,
        AdminModerationController,
        ReportsController,
        NotificationsController,
        UploadController,
        BlogController,
        CommentsController,
        TagsController,
        AuthorsController,
        AirportsController,
        AirlinesProfileController,
        AirlinesPoliciesController,
        FlightSearchController,
        FlightsController,
        FlightBookingsController,
        HotelsController,
        HotelBookingController,
        HotelBookingsController,
        ReviewsController,
        PaymentsController,
        PaymentsWebhookController,
        BookingPoliciesController,
        RefundsController,
        ItinerariesController,
        ActivitiesController,
        BudgetsController,
        TransportCostsController,
      ],
    })
      .useMocker(() => ({}))
      .compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();

    const swaggerConfig = new DocumentBuilder()
      .setTitle('Travel Planning and Booking API')
      .setDescription(
        'Complete OpenAPI 3.0 specification for the Travel Planning and Booking Platform (Accounts/Auth, Admin, Flights, Airlines, Airports, Flight Bookings, Hotels, Hotel Bookings, Reviews, Payments & Refunds, Itineraries, Blog, Reports, and Notifications).',
      )
      .setVersion('1.0')
      .addCookieAuth(ACCESS_TOKEN_COOKIE)
      .addTag('Auth', 'Registration, email verification, login, refresh, logout and password recovery: ACC-01 to ACC-08, ACC-19')
      .addTag('Users', 'Self-service profile management and account deactivation: ACC-09, ACC-11, ACC-12')
      .addTag('Admin', 'Moderator creation, account/provider status, bookings overview, audit logs and report moderation: ACC-07a, ACC-13 to ACC-17, GEN-07, GEN-10')
      .addTag('Reports', 'Registered users report posts, comments, reviews or itineraries: GEN-09')
      .addTag('Notifications', 'In-app notifications (unread count, list, mark as read) paired with SMTP email delivery: GEN-01, GEN-01-B')
      .addTag('Upload', 'Shared JPG/PNG image upload endpoint (max 5 MB) for airline logos, hotel photos, blog posts and itinerary activities: GEN-08, FLT-01, HTL-01')
      .addTag('Blog', 'Blog and community: BLG-01 to BLG-10, BLG-12, BLG-13')
      .addTag('Airports', 'Predefined airports, read-only: FLT-02')
      .addTag('Airlines', 'Airline profiles, baggage policies and cancellation tiers: FLT-01, FLT-04, FLT-08, FLT-09')
      .addTag('Flights', 'Flight management, cabins, search, details, bookings manifest and passenger CSV export: FLT-03 to FLT-06, FLT-11, FLT-12, FLT-15, FLT-17, FLT-29')
      .addTag('Flight bookings', 'Flight booking holds, e-tickets, cancellations, flight changes and seat selection: FLT-19, FLT-21 to FLT-28')
      .addTag('Hotels', 'Hotel profiles, rooms, availability, policies, search and reviews: HTL-01 to HTL-15, HTL-22, HTL-24')
      .addTag('Hotel bookings', 'Hotel room reservations, 10-minute holds, cancellations and review submission: HTL-16 to HTL-21, HTL-23')
      .addTag('Reviews', 'Edit/delete hotel reviews and moderator replies: HTL-23, HTL-26')
      .addTag('Payments', 'Stripe PaymentIntents, policy display & acceptance, webhooks and refunds: PAY-01 to PAY-03')
      .addTag('Itineraries', 'Itinerary planning, days, activities, budgets, FX conversion, cloning, bookings link and PDF export: ITN-01 to ITN-28')
      .build();

    document = SwaggerModule.createDocument(app, swaggerConfig);
    const orderedDocument = {
      openapi: document.openapi,
      info: document.info,
      tags: document.tags,
      paths: document.paths,
      components: document.components,
    };

    const header = [
      '# API contract (OpenAPI 3.0). Generated from the NestJS Swagger decorators across all modules.',
      '# Covers Accounts/Auth, Users, Admin, Reports, Notifications, Blog, Airports, Airlines, Flights,',
      '# Flight Bookings, Hotels, Hotel Bookings, Reviews, Payments/Policies/Refunds, and Itineraries.',
      '',
    ].join('\n');
    const yamlContent = header + yaml.dump(orderedDocument, { lineWidth: 120, noRefs: true });
    writeFileSync(openapiPath, yamlContent, 'utf8');
  });

  afterAll(async () => {
    await app?.close();
  });

  it('includes all required module endpoint groups (Section 1)', () => {
    const paths = Object.keys(document.paths);

    // Accounts / Auth / Users / Admin
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/auth/register',
        '/api/auth/verify-email',
        '/api/auth/login',
        '/api/auth/me',
        '/api/auth/logout',
        '/api/auth/forgot-password',
        '/api/auth/reset-password',
        '/api/auth/change-password',
        '/api/users/me',
        '/api/admin/users/{id}/reset-password',
        '/api/admin/moderators',
        '/api/admin/accounts',
        '/api/admin/accounts/{id}/suspend',
        '/api/admin/accounts/{id}/reactivate',
        '/api/admin/providers/{type}/{id}/deactivate',
        '/api/admin/providers/{type}/{id}/reactivate',
        '/api/admin/bookings',
      ]),
    );

    // Hotels / Hotel bookings / Reviews
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/hotels',
        '/api/hotels/search',
        '/api/hotels/{id}',
        '/api/hotels/{id}/rooms',
        '/api/hotels/{id}/rooms/available',
        '/api/hotels/{id}/policies',
        '/api/hotels/{id}/reservations',
        '/api/hotels/{id}/reviews',
        '/api/hotel-bookings',
        '/api/hotel-bookings/{id}',
        '/api/hotel-bookings/{id}/cancel',
        '/api/hotel-bookings/{id}/review',
        '/api/reviews/{id}',
        '/api/reviews/{id}/reply',
      ]),
    );

    // Payments / Refunds / Policy acceptance
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/payments',
        '/api/payments/{id}/retry',
        '/api/payments/{id}',
        '/api/payments/webhook',
        '/api/bookings/{type}/{id}/policies',
        '/api/bookings/{type}/{id}/accept-policies',
        '/api/refunds/{id}',
      ]),
    );

    // Itineraries / Activities / Budgets / Transport costs
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/itineraries',
        '/api/itineraries/{id}',
        '/api/itineraries/{id}/days',
        '/api/itineraries/{id}/days/{dayId}',
        '/api/itineraries/{id}/days/reorder',
        '/api/itineraries/{id}/days/{dayId}/activities',
        '/api/activities/{id}',
        '/api/activities/{id}/images',
        '/api/activities/{id}/images/{imageId}',
        '/api/itineraries/{id}/days/{dayId}/budgets',
        '/api/budgets/{id}',
        '/api/itineraries/{id}/budget-summary',
        '/api/itineraries/{id}/transport-costs',
        '/api/transport-costs/{id}',
        '/api/itineraries/public/search',
        '/api/itineraries/public/{id}',
        '/api/itineraries/{id}/clone',
        '/api/itineraries/{id}/hotels',
        '/api/itineraries/{id}/flights',
        '/api/itineraries/{id}/bookings',
        '/api/itineraries/{id}/pdf',
      ]),
    );

    // Admin moderation / Audit logs / Reports & User report creation
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/admin/audit-logs',
        '/api/admin/reports',
        '/api/admin/reports/{id}',
        '/api/admin/content/{type}/{id}',
        '/api/reports',
      ]),
    );

    // Notifications & Shared Upload
    expect(paths).toEqual(
      expect.arrayContaining([
        '/api/upload/image',
        '/api/notifications',
        '/api/notifications/unread-count',
        '/api/notifications/read-all',
        '/api/notifications/{id}/read',
      ]),
    );
  });

  it('includes all required flight, search, booking and airline endpoints (Sections 2 & 3)', () => {
    expect(document.paths['/api/flights/search']).toHaveProperty('get');
    expect(document.paths['/api/flights/{id}']).toHaveProperty('get');
    expect(document.paths['/api/flights/{id}']).toHaveProperty('patch');
    expect(document.paths['/api/flight-bookings']).toHaveProperty('post');
    expect(document.paths['/api/flight-bookings/hold']).toHaveProperty('post');
    expect(document.paths['/api/flight-bookings/{id}/e-ticket']).toHaveProperty('get');
    expect(document.paths['/api/flight-bookings/{id}/cancel']).toHaveProperty('post');
    expect(document.paths['/api/flight-bookings/{id}/change-flight']).toHaveProperty('patch');
    expect(document.paths['/api/flight-bookings/{id}/seat']).toHaveProperty('patch');

    expect(document.paths['/api/airlines']).toHaveProperty('post');
    expect(document.paths['/api/airlines/{id}']).toHaveProperty('get');
    expect(document.paths['/api/airlines/{id}']).toHaveProperty('patch');
    expect(document.paths['/api/airlines/{id}/baggage-policy']).toHaveProperty('get');
    expect(document.paths['/api/airlines/{id}/baggage-policy']).toHaveProperty('put');
    expect(document.paths['/api/airlines/{id}/cancellation-policy']).toHaveProperty('get');
    expect(document.paths['/api/airlines/{id}/cancellation-policy']).toHaveProperty('put');
  });

  it('resolves all schema and contract divergences within implemented modules (Section 4)', () => {
    // 1. Only the "cookie" security scheme is defined and referenced across all endpoints
    expect(document.components?.securitySchemes).toHaveProperty('cookie');
    const serialized = JSON.stringify(document.paths);
    expect(serialized).not.toContain('"access_token"');
    expect(serialized).not.toContain('"access-token"');

    const schemas = document.components?.schemas as Record<string, any>;

    // 2. Blog tags enforce maxItems: 5 and maxLength: 30 per tag (BLG-08)
    expect(schemas.CreatePostDto.properties.tags.maxItems).toBe(5);
    expect(schemas.CreatePostDto.properties.tags.items.maxLength).toBe(30);
    expect(schemas.UpdatePostDto.properties.tags.maxItems).toBe(5);
    expect(schemas.UpdatePostDto.properties.tags.items.maxLength).toBe(30);

    // 3. Comments enforce minLength: 1 and maxLength: 500 (BLG-05)
    expect(schemas.CommentDto.properties.text.minLength).toBe(1);
    expect(schemas.CommentDto.properties.text.maxLength).toBe(500);

    // 4. Cabin model includes seatCount, freeBagCount and freeBagWeight (FLT-04, FLT-08)
    expect(schemas.CreateCabinDto.properties).toHaveProperty('seatCount');
    expect(schemas.CreateCabinDto.properties).toHaveProperty('freeBagCount');
    expect(schemas.CreateCabinDto.properties).toHaveProperty('freeBagWeight');

    // 5. Flight number enforces 1-4 digits pattern (FLT-03)
    expect(schemas.CreateFlightDto.properties.number.pattern).toBe('^\\d{1,4}$');

    // 6. Passport number enforces 5-20 alphanumeric pattern (FLT-19)
    expect(schemas.BookingPassengerDto.properties.passportNumber.pattern).toBe('^[A-Za-z0-9]{5,20}$');

    // 7. Flight cancellation & schedule-change notifications are documented (FLT-05, FLT-06)
    const cancelDesc = document.paths['/api/flights/{id}/cancel']?.post?.description ?? '';
    expect(cancelDesc).toMatch(/100% refund/i);
    expect(cancelDesc).toMatch(/notification/i);

    const patchDesc = document.paths['/api/flights/{id}']?.patch?.description ?? '';
    expect(patchDesc).toMatch(/notification/i);
  });
});
