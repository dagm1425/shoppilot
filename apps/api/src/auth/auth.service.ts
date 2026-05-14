import { createHash, randomBytes } from 'node:crypto';
import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import type { Response } from 'express';
import { Role } from '@prisma/client';
import { parseEnv } from '../config/env.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { buildAuthCookieOptions, computeResetTokenExpiry } from './auth-cookie.js';
import { PasswordResetMailerService } from './password-reset-mailer.service.js';
import type {
  AuthenticatedRequestUser,
  AuthTokenPayload,
} from './auth.types.js';
import type {
  LoginInput,
  PasswordResetConfirmInput,
  PasswordResetRequestInput,
  RegisterInput,
} from './auth.schemas.js';

const RESET_RESPONSE_MESSAGE = 'If an account exists, reset instructions have been sent.';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly env = parseEnv(process.env);

  constructor(
    @Inject(PrismaService)
    private readonly prisma: PrismaService,
    @Inject(JwtService)
    private readonly jwtService: JwtService,
    @Inject(PasswordResetMailerService)
    private readonly passwordResetMailer: PasswordResetMailerService,
  ) {}

  async register(input: RegisterInput, response: Response) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (existing) {
      throw new HttpException(
        {
          code: 'AUTH_EMAIL_EXISTS',
          message: 'An account with this email already exists.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const existingUsername = await this.prisma.user.findUnique({
      where: { username: input.username },
      select: { id: true },
    });

    if (existingUsername) {
      throw new HttpException(
        {
          code: 'AUTH_USERNAME_EXISTS',
          message: 'This username is already in use.',
        },
        HttpStatus.CONFLICT,
      );
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        username: input.username,
        email: input.email,
        passwordHash,
        role: Role.CUSTOMER,
      },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        sessionVersion: true,
      },
    });

    const token = await this.signAuthToken({
      id: user.id,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });

    this.setAuthCookie(response, token);

    // future: registration email verification - deferred to dedicated auth hardening scope
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  async login(input: LoginInput, response: Response) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (!user || !(await argon2.verify(user.passwordHash, input.password))) {
      throw new HttpException(
        {
          code: 'AUTH_INVALID_CREDENTIALS',
          message: 'Invalid email or password.',
        },
        HttpStatus.UNAUTHORIZED,
      );
    }

    const token = await this.signAuthToken({
      id: user.id,
      role: user.role,
      sessionVersion: user.sessionVersion,
    });

    const cookieTtlMinutes = input.rememberMe
      ? this.env.AUTH_COOKIE_TTL_REMEMBER_MINUTES
      : this.env.AUTH_COOKIE_TTL_MINUTES;
    this.setAuthCookie(response, token, cookieTtlMinutes);

    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  async logout(user: AuthenticatedRequestUser, response: Response) {
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        sessionVersion: {
          increment: 1,
        },
      },
    });

    response.clearCookie(this.env.AUTH_COOKIE_NAME, buildAuthCookieOptions(this.env));

    return { message: 'Logged out.' };
  }

  async me(user: AuthenticatedRequestUser) {
    return {
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    };
  }

  async requestPasswordReset(input: PasswordResetRequestInput, requestId?: string) {
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (!user) {
      return { message: RESET_RESPONSE_MESSAGE };
    }

    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = computeResetTokenExpiry(this.env.AUTH_RESET_TOKEN_TTL_MINUTES);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
      },
    });

    try {
      await this.passwordResetMailer.sendResetLink({
        userId: user.id,
        email: user.email,
        resetToken: rawToken,
        requestId,
      });
    } catch (error) {
      this.logger.error({
        message: 'Password reset delivery failed',
        code: 'AUTH_RESET_DELIVERY_FAILED',
        requestId: requestId ?? 'unknown-request-id',
        userId: user.id,
        emailHash: this.hashToken(user.email),
        error: error instanceof Error ? error.message : 'unknown error',
      });
    }

    return { message: RESET_RESPONSE_MESSAGE };
  }

  async confirmPasswordReset(input: PasswordResetConfirmInput) {
    const tokenHash = this.hashToken(input.token);

    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          select: {
            id: true,
          },
        },
      },
    });

    if (!resetToken || !resetToken.user || resetToken.usedAt) {
      throw new HttpException(
        {
          code: 'AUTH_RESET_TOKEN_INVALID',
          message: 'Reset token is invalid.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (resetToken.expiresAt.getTime() <= Date.now()) {
      throw new HttpException(
        {
          code: 'AUTH_RESET_TOKEN_EXPIRED',
          message: 'Reset token has expired.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.user.id },
        data: {
          passwordHash,
          sessionVersion: {
            increment: 1,
          },
        },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: {
          usedAt: new Date(),
        },
      }),
      this.prisma.passwordResetToken.updateMany({
        where: {
          userId: resetToken.user.id,
          usedAt: null,
        },
        data: {
          usedAt: new Date(),
        },
      }),
    ]);

    // future: email verification - deferred to trust-hardening scope
    // future: mfa - deferred to security hardening scope
    return { message: 'Password reset successful.' };
  }

  private async signAuthToken(input: {
    id: string;
    role: Role;
    sessionVersion: number;
  }): Promise<string> {
    const payload: AuthTokenPayload = {
      sub: input.id,
      role: input.role,
      sessionVersion: input.sessionVersion,
    };

    return this.jwtService.signAsync(payload);
  }

  private setAuthCookie(
    response: Response,
    token: string,
    ttlMinutes = this.env.AUTH_COOKIE_TTL_MINUTES,
  ): void {
    response.cookie(this.env.AUTH_COOKIE_NAME, token, {
      ...buildAuthCookieOptions(this.env, ttlMinutes),
    });
  }

  private hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
