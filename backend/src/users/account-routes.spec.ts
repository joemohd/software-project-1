import { ConflictException, INestApplication, ValidationPipe } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { Types } from 'mongoose';
import request from 'supertest';
import { AdminUsersController } from '../admin/admin-users.controller.js';
import { AdminService } from '../admin/admin.service.js';
import authConfig from '../auth/auth.config.js';
import { AuthController } from '../auth/auth.controller.js';
import { AuthService } from '../auth/auth.service.js';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from '../auth/auth.helper.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { User, UserActivityStatus, UserRole } from '../database/schemas/user.schema.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

const userId = new Types.ObjectId();
const adminId = new Types.ObjectId();
const moderatorId = new Types.ObjectId();
const airlineModeratorId = new Types.ObjectId();
const otherUserId = new Types.ObjectId();
const authenticatedAccounts = [
  { id: userId, role: UserRole.USER },
  { id: otherUserId, role: UserRole.USER },
  { id: adminId, role: UserRole.ADMIN },
  { id: moderatorId, role: UserRole.HOTEL_MODERATOR },
  { id: airlineModeratorId, role: UserRole.AIRLINE_MODERATOR },
];
const records = new Map(authenticatedAccounts.map(({ id, role }) => [
  id.toString(), { _id: id, role, status: UserActivityStatus.ACTIVE, isVerified: true },
] as const));
const meRoutes = [
  ['get', '/api/users/me'], ['patch', '/api/users/me'], ['delete', '/api/users/me'], ['get', '/api/auth/me'],
] as const;

describe('Account API routes', () => {
  let app: INestApplication;
  const jwt = new JwtService({ secret: 'account-route-test' });
  const usersService = {
    me: vi.fn(async (user) => ({ id: user.id, fullName: 'Mona', emailAddress: 'mona@example.com' })),
    updateMe: vi.fn(async (_user, dto) => dto),
    deactivateMe: vi.fn().mockResolvedValue({ message: 'Your account has been deactivated.' }),
  };
  const adminService = { resetUserPassword: vi.fn().mockResolvedValue({ message: 'Temporary password set.' }) };
  const authService = { me: vi.fn(async (user) => ({ id: user.id, fullName: 'Mona' })) };
  const cookieFor = async (id: Types.ObjectId) => `${ACCESS_TOKEN_COOKIE}=${await jwt.signAsync({ sub: id.toString(), type: 'access' })}`;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [UsersController, AdminUsersController, AuthController],
      providers: [
        { provide: UsersService, useValue: usersService },
        { provide: AdminService, useValue: adminService },
        { provide: AuthService, useValue: authService },
        { provide: authConfig.KEY, useValue: { cookieSecure: true } },
        { provide: JwtService, useValue: jwt },
        { provide: getModelToken(User.name), useValue: {
          findById: (id: string) => ({ select: vi.fn().mockReturnThis(), lean: vi.fn().mockReturnThis(), exec: async () => records.get(id) }),
        } },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    }).compile();
    app = module.createNestApplication();
    app.setGlobalPrefix('api');
    app.use(cookieParser());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  beforeEach(() => vi.clearAllMocks());
  afterAll(async () => app?.close());

  it.each([
    ...meRoutes,
    ['post', `/api/admin/users/${userId.toString()}/reset-password`],
  ] as const)('requires login for %s %s', async (method, path) => {
    await request(app.getHttpServer())[method](path).expect(401);
  });

  it('reads the current profile using the authenticated identity', async () => {
    const response = await request(app.getHttpServer()).get(`/api/users/me?userId=${otherUserId.toString()}`)
      .set('Cookie', await cookieFor(userId)).expect(200);
    expect(response.body.id).toBe(userId.toString());
    expect(usersService.me).toHaveBeenCalledWith(expect.objectContaining({ id: userId.toString() }));
  });

  it.each(authenticatedAccounts)('lets a signed-in $role read their own profile through @CurrentUser()', async ({ id, role }) => {
    const response = await request(app.getHttpServer()).get('/api/users/me')
      .set('Cookie', await cookieFor(id)).expect(200);
    expect(response.body.id).toBe(id.toString());
    expect(usersService.me).toHaveBeenCalledWith(expect.objectContaining({ id: id.toString(), role }));
  });

  it.each(authenticatedAccounts)('lets a signed-in $role update their own profile through @CurrentUser()', async ({ id, role }) => {
    await request(app.getHttpServer()).patch('/api/users/me')
      .set('Cookie', await cookieFor(id)).send({ fullName: 'Updated name' }).expect(200);
    expect(usersService.updateMe).toHaveBeenCalledWith(
      expect.objectContaining({ id: id.toString(), role }), expect.objectContaining({ fullName: 'Updated name' }),
    );
  });

  it.each(authenticatedAccounts)('returns only the current $role account from auth/me', async ({ id, role }) => {
    const response = await request(app.getHttpServer()).get(`/api/auth/me?userId=${otherUserId.toString()}`)
      .set('Cookie', await cookieFor(id)).expect(200);
    expect(response.body.id).toBe(id.toString());
    expect(authService.me).toHaveBeenCalledWith(expect.objectContaining({ id: id.toString(), role }));
  });

  it.each(meRoutes)('rejects an unregistered account on %s %s', async (method, path) => {
    await request(app.getHttpServer())[method](path).set('Cookie', await cookieFor(new Types.ObjectId())).expect(401);
  });

  it.each(['get', 'patch', 'delete'] as const)('does not expose a %s endpoint targeting another user id', async (method) => {
    await request(app.getHttpServer())[method](`/api/users/${otherUserId.toString()}`)
      .set('Cookie', await cookieFor(userId)).expect(404);
  });

  it.each(['patch', 'delete'] as const)('rejects a supplied identity in %s /users/me', async (method) => {
    const body = method === 'patch' ? { fullName: 'Updated' } : { confirm: true };
    await request(app.getHttpServer())[method]('/api/users/me').set('Cookie', await cookieFor(userId))
      .send({ ...body, userId: otherUserId.toString() }).expect(400);
    expect(usersService.updateMe).not.toHaveBeenCalled();
    expect(usersService.deactivateMe).not.toHaveBeenCalled();
  });

  it('validates and normalizes profile edits', async () => {
    await request(app.getHttpServer()).patch('/api/users/me').set('Cookie', await cookieFor(userId))
      .send({ fullName: '  Mona Ahmed  ', phoneNumber: '+201234567890', preferredCurrency: ' usd ' }).expect(200);
    expect(usersService.updateMe).toHaveBeenCalledWith(expect.objectContaining({ id: userId.toString() }),
      expect.objectContaining({ fullName: 'Mona Ahmed', phoneNumber: '+201234567890', preferredCurrency: 'USD' }));
  });

  it.each([
    { fullName: '   ' }, { phoneNumber: '01234567890' }, { preferredCurrency: 'US' },
    { fullName: null }, { phoneNumber: null }, { preferredCurrency: null },
    { role: 'admin' }, { emailAddress: 'other@example.com' }, { passwordHash: 'injected' },
  ])('rejects invalid or unauthorized profile fields: %j', async (body) => {
    await request(app.getHttpServer()).patch('/api/users/me').set('Cookie', await cookieFor(userId)).send(body).expect(400);
    expect(usersService.updateMe).not.toHaveBeenCalled();
  });

  it.each([{}, { confirm: false }, { confirm: 'true' }])('requires explicit deactivation confirmation: %j', async (body) => {
    await request(app.getHttpServer()).delete('/api/users/me').set('Cookie', await cookieFor(userId)).send(body).expect(400);
    expect(usersService.deactivateMe).not.toHaveBeenCalled();
  });

  it.each([adminId, moderatorId, airlineModeratorId])('prevents staff accounts from using self-deactivation', async (id) => {
    await request(app.getHttpServer()).delete('/api/users/me').set('Cookie', await cookieFor(id)).send({ confirm: true }).expect(403);
    expect(usersService.deactivateMe).not.toHaveBeenCalled();
  });

  it('clears both auth cookies after a successful deactivation', async () => {
    const response = await request(app.getHttpServer()).delete('/api/users/me')
      .set('Cookie', await cookieFor(userId)).send({ confirm: true }).expect(200);
    const cookies = response.headers['set-cookie'];
    expect(cookies).toEqual(expect.arrayContaining([
      expect.stringContaining(`${ACCESS_TOKEN_COOKIE}=;`), expect.stringContaining(`${REFRESH_TOKEN_COOKIE}=;`),
    ]));
  });

  it('preserves cookies when upcoming bookings block deactivation', async () => {
    usersService.deactivateMe.mockRejectedValueOnce(new ConflictException('Upcoming confirmed bookings.'));
    const response = await request(app.getHttpServer()).delete('/api/users/me')
      .set('Cookie', await cookieFor(userId)).send({ confirm: true }).expect(409);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it.each([userId, moderatorId, airlineModeratorId])('rejects password resets by non-admin accounts', async (id) => {
    await request(app.getHttpServer()).post(`/api/admin/users/${userId.toString()}/reset-password`)
      .set('Cookie', await cookieFor(id)).send({ temporaryPassword: 'Temporary123' }).expect(403);
    expect(adminService.resetUserPassword).not.toHaveBeenCalled();
  });

  it('allows an admin to set a temporary password', async () => {
    await request(app.getHttpServer()).post(`/api/admin/users/${userId.toString()}/reset-password`)
      .set('Cookie', await cookieFor(adminId)).send({ temporaryPassword: 'Temporary123' }).expect(200);
    expect(adminService.resetUserPassword).toHaveBeenCalledWith(expect.objectContaining({ id: adminId.toString() }),
      userId.toString(), expect.objectContaining({ temporaryPassword: 'Temporary123' }));
  });

  it('rejects an invalid target id', async () => {
    await request(app.getHttpServer()).post('/api/admin/users/not-an-id/reset-password')
      .set('Cookie', await cookieFor(adminId)).send({ temporaryPassword: 'Temporary123' }).expect(400);
    expect(adminService.resetUserPassword).not.toHaveBeenCalled();
  });

  it.each([{}, { temporaryPassword: 'short' }, { temporaryPassword: 'abcdefgh' }, { temporaryPassword: '12345678' }])(
    'validates temporary-password rules: %j', async (body) => {
      await request(app.getHttpServer()).post(`/api/admin/users/${userId.toString()}/reset-password`)
        .set('Cookie', await cookieFor(adminId)).send(body).expect(400);
      expect(adminService.resetUserPassword).not.toHaveBeenCalled();
    },
  );

  it('publishes all four operations in Swagger', () => {
    const document = SwaggerModule.createDocument(app, new DocumentBuilder().addCookieAuth(ACCESS_TOKEN_COOKIE).build());
    expect(document.paths['/api/users/me']).toHaveProperty('get');
    expect(document.paths['/api/users/me']).toHaveProperty('patch');
    expect(document.paths['/api/users/me']).toHaveProperty('delete');
    expect(document.paths['/api/admin/users/{id}/reset-password']).toHaveProperty('post');
  });
});
