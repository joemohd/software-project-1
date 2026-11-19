import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { OptionalJwtAuthGuard } from './optional-jwt-auth.guard.js';
import { RolesGuard } from './roles.guard.js';

/**
 * Wires JWT verification and provides the auth guards for the whole app.
 *
 * SHARED / FOUNDATION MODULE — coordinate with the Auth (ACC) teammate. If they
 * already configure JwtModule + guards, import their module instead of this one
 * and delete this file. The `@Global()` decorator makes the guards injectable
 * from any feature module without re-importing.
 *
 * Reads JWT_SECRET (and optional JWT_EXPIRES) from the environment.
 */
@Global()
@Module({
  imports: [
    JwtModule.registerAsync({
      useFactory: () => ({
        secret: process.env.JWT_SECRET ?? 'dev-insecure-change-me',
        // `expiresIn` accepts a number (seconds) or an "ms" string like '1d'/'15m'.
        signOptions: { expiresIn: (process.env.JWT_EXPIRES ?? '1d') as `${number}d` },
      }),
    }),
  ],
  providers: [JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
  exports: [JwtModule, JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard],
})
export class AuthModule {}
