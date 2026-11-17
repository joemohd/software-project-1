import { Test, TestingModule } from '@nestjs/testing';
import authConfig from './auth.config.js';
import { ACCESS_TOKEN_COOKIE, REFRESH_TOKEN_COOKIE } from './auth.helper.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';

const profile = {
  id: '507f1f77bcf86cd799439011',
  fullName: 'Test User',
  emailAddress: 'test@example.com',
  username: 'test',
  role: 'user',
  isVerified: true,
};
const tokens = {
  accessToken: 'access',
  accessTokenMaxAgeSeconds: 900,
  refreshToken: 'refresh',
  refreshTokenMaxAgeSeconds: 1800,
};

const responseMock = () => {
  const res = { cookie: vi.fn(), clearCookie: vi.fn() };
  res.cookie.mockReturnValue(res);
  res.clearCookie.mockReturnValue(res);
  return res;
};

describe('AuthController', () => {
  let controller: AuthController;
  const authService = {
    login: vi.fn(),
    refresh: vi.fn(),
    logout: vi.fn(),
  };

  beforeEach(async () => {
    vi.resetAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: authService },
        { provide: authConfig.KEY, useValue: { cookieSecure: true } },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('login sets httpOnly cookies and returns only the user (no tokens in the body)', async () => {
    authService.login.mockResolvedValue({ user: profile, tokens });
    const res = responseMock();

    const body = await controller.login({ emailAddress: 'test@example.com', password: 'x' }, res as never);

    expect(body).toEqual({ user: profile });
    expect(res.cookie).toHaveBeenCalledWith(
      ACCESS_TOKEN_COOKIE,
      'access',
      expect.objectContaining({ httpOnly: true, secure: true, sameSite: 'lax', maxAge: 900_000 }),
    );
    expect(res.cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      'refresh',
      expect.objectContaining({ httpOnly: true, path: '/api/auth', maxAge: 1_800_000 }),
    );
  });

  it('refresh clears the cookies when the session is no longer valid', async () => {
    authService.refresh.mockRejectedValue(new Error('expired'));
    const res = responseMock();

    await expect(controller.refresh('stale', res as never)).rejects.toThrow('expired');
    expect(res.clearCookie).toHaveBeenCalledWith(ACCESS_TOKEN_COOKIE, expect.anything());
    expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_TOKEN_COOKIE, expect.anything());
  });

  it('logout revokes the refresh token and clears the cookies', async () => {
    authService.logout.mockResolvedValue({ message: 'You have been logged out.' });
    const res = responseMock();

    await controller.logout('refresh', res as never);

    expect(authService.logout).toHaveBeenCalledWith('refresh');
    expect(res.clearCookie).toHaveBeenCalledTimes(2);
  });
});
