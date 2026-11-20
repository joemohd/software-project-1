import { INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Types } from 'mongoose';
import request from 'supertest';
import { AirlinesController } from '../../airlines/airlines.controller.js';
import { AirlinesService } from '../../airlines/airlines.service.js';
import { ACCESS_TOKEN_COOKIE } from '../../auth/auth.helper.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import { User, UserActivityStatus, UserRole } from '../../database/schemas/user.schema.js';
import { HotelsController } from '../../hotels/hotels.controller.js';
import { HotelsService } from '../../hotels/hotels.service.js';

const hotelId = new Types.ObjectId().toString();
const airlineId = new Types.ObjectId().toString();
const actors = Object.values(UserRole).map((role) => ({ _id: new Types.ObjectId(), role, status: UserActivityStatus.ACTIVE, isVerified: true }));
const actorFor = (role: UserRole) => actors.find((actor) => actor.role === role)!;
const hotel = {
  name: 'Cairo Hotel', address: '1 Example Street', cityId: new Types.ObjectId().toString(), countryId: new Types.ObjectId().toString(),
  moderatorId: actorFor(UserRole.HOTEL_MODERATOR)._id.toString(), starClass: 4,
};
const airline = { name: 'Example Air', iataCode: 'EA', logoUrl: 'https://example.com/logo.png', moderatorId: actorFor(UserRole.AIRLINE_MODERATOR)._id.toString() };

describe('Hotel and airline profile HTTP APIs', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: 'profile-route-test' });
  const hotelsService = {
    create: vi.fn().mockResolvedValue({ id: hotelId, ...hotel }),
    update: vi.fn().mockResolvedValue({ id: hotelId, name: 'Updated' }),
  };
  const airlinesService = {
    create: vi.fn().mockResolvedValue({ id: airlineId, ...airline }),
    findOne: vi.fn().mockResolvedValue({ id: airlineId, name: airline.name, iataCode: airline.iataCode, logoUrl: airline.logoUrl }),
    update: vi.fn().mockResolvedValue({ id: airlineId, name: 'Updated' }),
  };
  const cookieFor = async (role: UserRole) => `${ACCESS_TOKEN_COOKIE}=${await jwt.signAsync({ sub: actorFor(role)._id.toString(), type: 'access' })}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [HotelsController, AirlinesController],
      providers: [
        { provide: HotelsService, useValue: hotelsService }, { provide: AirlinesService, useValue: airlinesService },
        { provide: JwtService, useValue: jwt },
        { provide: getModelToken(User.name), useValue: {
          findById: (id: string) => ({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockReturnThis(), exec: async () => actors.find((actor) => actor._id.toString() === id) }),
        } },
        { provide: APP_GUARD, useClass: JwtAuthGuard }, { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
    await app.init();
  });
  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app?.close());

  it.each([
    ['post', '/api/hotels'], ['post', '/api/airlines'], ['patch', `/api/hotels/${hotelId}`], ['patch', `/api/airlines/${airlineId}`],
  ] as const)('rejects guests on %s %s', async (method, path) => {
    await request(app.getHttpServer())[method](path).expect(401);
  });

  it('lets guests read an active airline profile', async () => {
    const result = await request(app.getHttpServer()).get(`/api/airlines/${airlineId}`).expect(200);
    expect(result.body).not.toHaveProperty('moderatorId');
    expect(airlinesService.findOne).toHaveBeenCalledWith(airlineId);
  });

  it('creates a hotel as the current admin', async () => {
    await request(app.getHttpServer()).post('/api/hotels').set('Cookie', await cookieFor(UserRole.ADMIN)).send(hotel).expect(201);
    expect(hotelsService.create).toHaveBeenCalledWith(expect.objectContaining({ id: actorFor(UserRole.ADMIN)._id.toString(), role: UserRole.ADMIN }), expect.objectContaining(hotel));
  });

  it('creates an airline and normalizes its name and code', async () => {
    await request(app.getHttpServer()).post('/api/airlines').set('Cookie', await cookieFor(UserRole.ADMIN))
      .send({ ...airline, name: '  Example Air  ', iataCode: ' ea ' }).expect(201);
    expect(airlinesService.create).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ name: 'Example Air', iataCode: 'EA' }));
  });

  it.each([UserRole.USER, UserRole.HOTEL_MODERATOR, UserRole.AIRLINE_MODERATOR])('prevents a %s from creating providers', async (role) => {
    await request(app.getHttpServer()).post('/api/hotels').set('Cookie', await cookieFor(role)).send(hotel).expect(403);
    await request(app.getHttpServer()).post('/api/airlines').set('Cookie', await cookieFor(role)).send(airline).expect(403);
    expect(hotelsService.create).not.toHaveBeenCalled();
    expect(airlinesService.create).not.toHaveBeenCalled();
  });

  it('passes the current hotel moderator identity to the update service', async () => {
    await request(app.getHttpServer()).patch(`/api/hotels/${hotelId}`).set('Cookie', await cookieFor(UserRole.HOTEL_MODERATOR))
      .send({ name: '  Updated  ', amenities: [' Wi-Fi ', 'Pool'] }).expect(200);
    expect(hotelsService.update).toHaveBeenCalledWith(expect.objectContaining({ id: actorFor(UserRole.HOTEL_MODERATOR)._id.toString() }),
      hotelId, expect.objectContaining({ name: 'Updated', amenities: ['Wi-Fi', 'Pool'] }));
  });

  it('passes the current airline moderator identity to the update service', async () => {
    await request(app.getHttpServer()).patch(`/api/airlines/${airlineId}`).set('Cookie', await cookieFor(UserRole.AIRLINE_MODERATOR))
      .send({ name: 'Updated' }).expect(200);
    expect(airlinesService.update).toHaveBeenCalledWith(expect.objectContaining({ id: actorFor(UserRole.AIRLINE_MODERATOR)._id.toString() }),
      airlineId, expect.objectContaining({ name: 'Updated' }));
  });

  it.each([UserRole.ADMIN, UserRole.USER, UserRole.AIRLINE_MODERATOR])('prevents a %s from editing hotels', async (role) => {
    await request(app.getHttpServer()).patch(`/api/hotels/${hotelId}`).set('Cookie', await cookieFor(role)).send({ name: 'Updated' }).expect(403);
  });

  it.each([UserRole.ADMIN, UserRole.USER, UserRole.HOTEL_MODERATOR])('prevents a %s from editing airlines', async (role) => {
    await request(app.getHttpServer()).patch(`/api/airlines/${airlineId}`).set('Cookie', await cookieFor(role)).send({ name: 'Updated' }).expect(403);
  });

  it.each([
    { name: '   ' }, { starClass: 0 }, { starClass: 6 }, { starClass: 2.5 }, { starClass: null },
    { cityId: 'invalid' }, { countryId: 'invalid' }, { moderatorId: 'invalid' },
    { imageUrls: ['javascript:alert(1)'] }, { imageUrls: Array.from({ length: 6 }, (_value, i) => `https://example.com/${i}.png`) },
    { imageUrls: ['https://example.com/a.png', 'https://example.com/a.png'] },
    { amenities: ['   '] }, { amenities: ['Wi-Fi', ' wi-fi '] }, { amenities: [null] },
    { averageRating: 5 }, { status: 'active' },
  ])('rejects invalid hotel creation fields: %j', async (change) => {
    await request(app.getHttpServer()).post('/api/hotels').set('Cookie', await cookieFor(UserRole.ADMIN)).send({ ...hotel, ...change }).expect(400);
    expect(hotelsService.create).not.toHaveBeenCalled();
  });

  it('accepts five hotel image URLs', async () => {
    await request(app.getHttpServer()).post('/api/hotels').set('Cookie', await cookieFor(UserRole.ADMIN))
      .send({ ...hotel, imageUrls: Array.from({ length: 5 }, (_value, i) => `https://example.com/${i}.png`) }).expect(201);
  });

  it.each([{ name: null }, { moderatorId: hotel.moderatorId }, { status: 'deactivated' }, { averageRating: 5 }])('rejects protected or null hotel edit fields: %j', async (body) => {
    await request(app.getHttpServer()).patch(`/api/hotels/${hotelId}`).set('Cookie', await cookieFor(UserRole.HOTEL_MODERATOR)).send(body).expect(400);
    expect(hotelsService.update).not.toHaveBeenCalled();
  });

  it.each([{ iataCode: 'A' }, { iataCode: 'ABCD' }, { iataCode: '1AB' }, { logoUrl: ['https://example.com/logo.png'] }, { logoUrl: 'file:///logo.png' }])('rejects invalid airline fields: %j', async (change) => {
    await request(app.getHttpServer()).post('/api/airlines').set('Cookie', await cookieFor(UserRole.ADMIN)).send({ ...airline, ...change }).expect(400);
    expect(airlinesService.create).not.toHaveBeenCalled();
  });

  it.each([{ logoUrl: null }, { moderatorId: airline.moderatorId }, { bagPolicy: {} }, { providerType: 'hotel' }])('rejects protected or null airline edit fields: %j', async (body) => {
    await request(app.getHttpServer()).patch(`/api/airlines/${airlineId}`).set('Cookie', await cookieFor(UserRole.AIRLINE_MODERATOR)).send(body).expect(400);
    expect(airlinesService.update).not.toHaveBeenCalled();
  });

  it('validates airline id on public reads', async () => {
    await request(app.getHttpServer()).get('/api/airlines/invalid').expect(400);
    expect(airlinesService.findOne).not.toHaveBeenCalled();
  });

  it('validates provider ids on edits', async () => {
    await request(app.getHttpServer()).patch('/api/hotels/invalid').set('Cookie', await cookieFor(UserRole.HOTEL_MODERATOR)).send({ name: 'Updated' }).expect(400);
    await request(app.getHttpServer()).patch('/api/airlines/invalid').set('Cookie', await cookieFor(UserRole.AIRLINE_MODERATOR)).send({ name: 'Updated' }).expect(400);
  });

  it('documents all five operations in Swagger', () => {
    const doc = SwaggerModule.createDocument(app, new DocumentBuilder().addCookieAuth(ACCESS_TOKEN_COOKIE).build());
    expect(doc.paths['/api/hotels']).toHaveProperty('post');
    expect(doc.paths['/api/hotels/{id}']).toHaveProperty('patch');
    expect(doc.paths['/api/airlines']).toHaveProperty('post');
    expect(doc.paths['/api/airlines/{id}']).toHaveProperty('get');
    expect(doc.paths['/api/airlines/{id}']).toHaveProperty('patch');
  });
});
