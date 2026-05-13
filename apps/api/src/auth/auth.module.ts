import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ThrottlerModule } from '@nestjs/throttler';
import { parseEnv } from '../config/env.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtStrategy } from './jwt.strategy.js';
import { PasswordResetMailerService } from './password-reset-mailer.service.js';
import { RolesGuard } from './roles.guard.js';

const env = parseEnv(process.env);

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: env.JWT_SECRET,
      signOptions: {
        expiresIn: `${env.AUTH_COOKIE_TTL_MINUTES}m`,
      },
    }),
    ThrottlerModule.forRoot([
      {
        name: 'default',
        limit: env.AUTH_RATE_LIMIT_MAX,
        ttl: env.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60_000,
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordResetMailerService,
    JwtStrategy,
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [JwtAuthGuard, RolesGuard],
})
export class AuthModule {}
