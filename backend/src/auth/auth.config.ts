import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  jwtSecret: process.env.JWT_SECRET,
  // Access token lifetime in seconds (default: 15 minutes)
  jwtExpiresInSeconds: Number(process.env.JWT_EXPIRES_IN_SECONDS ?? 900),
  // ACC-06: a session with no activity for this long expires (default: 30 minutes)
  refreshTokenIdleSeconds: Number(process.env.REFRESH_TOKEN_IDLE_SECONDS ?? 1800),
  // ACC-19: auth cookies are Secure by default. Set COOKIE_SECURE=false only for local HTTP tools that drop Secure cookies.
  cookieSecure: process.env.COOKIE_SECURE !== 'false',
  // Used to build links in verification / password-reset emails
  frontendUrl: process.env.FRONTEND_URL ?? 'http://localhost:3001',
  isProduction: process.env.NODE_ENV === 'production',
  // GEN-01-B: emails go out over SMTP. Without SMTP_HOST, development uses a throwaway Ethereal test inbox.
  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true', // true for port 465, false for 587 (STARTTLS)
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM ?? 'Travel Planner <no-reply@travel-planner.local>',
  },
}));
