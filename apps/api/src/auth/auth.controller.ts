import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import type { RequestWithContext } from '../common/request-context.js';
import { parseEnv } from '../config/env.js';
import { CurrentUser } from './current-user.decorator.js';
import {
  loginSchema,
  parseOrThrow,
  passwordResetConfirmSchema,
  passwordResetRequestSchema,
  registerSchema,
} from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { Roles } from './roles.decorator.js';
import { RolesGuard } from './roles.guard.js';
import type { AuthenticatedRequestUser } from './auth.types.js';

const env = parseEnv(process.env);

@Controller('auth')
export class AuthController {
  constructor(@Inject(AuthService) private readonly authService: AuthService) {}

  @Post('register')
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: env.AUTH_RATE_LIMIT_MAX,
      ttl: env.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60_000,
    },
  })
  async register(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parseOrThrow(registerSchema, body);
    return this.authService.register(input, response);
  }

  @Post('login')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: env.AUTH_RATE_LIMIT_MAX,
      ttl: env.AUTH_RATE_LIMIT_WINDOW_MINUTES * 60_000,
    },
  })
  async login(@Body() body: unknown, @Res({ passthrough: true }) response: Response) {
    const input = parseOrThrow(loginSchema, body);
    return this.authService.login(input, response);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(200)
  async logout(
    @CurrentUser() user: AuthenticatedRequestUser,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.authService.logout(user, response);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: AuthenticatedRequestUser) {
    return this.authService.me(user);
  }

  @Post('password-reset/request')
  @HttpCode(200)
  @UseGuards(ThrottlerGuard)
  @Throttle({
    default: {
      limit: env.AUTH_RESET_RATE_LIMIT_MAX,
      ttl: env.AUTH_RESET_RATE_LIMIT_WINDOW_MINUTES * 60_000,
    },
  })
  async requestPasswordReset(@Body() body: unknown, @Req() request: RequestWithContext) {
    const input = parseOrThrow(passwordResetRequestSchema, body);
    return this.authService.requestPasswordReset(input, request.requestId);
  }

  @Post('password-reset/confirm')
  @HttpCode(200)
  async confirmPasswordReset(@Body() body: unknown) {
    const input = parseOrThrow(passwordResetConfirmSchema, body);
    return this.authService.confirmPasswordReset(input);
  }

  @Get('admin-probe')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  adminProbe() {
    return {
      ok: true,
      scope: 'admin',
    };
  }
}
