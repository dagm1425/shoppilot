import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { parseEnv } from '../config/env.js';
import type { AuthTokenPayload, AuthenticatedRequestUser } from './auth.types.js';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {
    const env = parseEnv(process.env);

    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        (request: Request | null): string | null => {
          if (!request || !request.cookies) {
            return null;
          }

          const token = request.cookies[env.AUTH_COOKIE_NAME];
          return typeof token === 'string' ? token : null;
        },
      ]),
      ignoreExpiration: false,
      secretOrKey: env.JWT_SECRET,
    });
  }

  async validate(payload: AuthTokenPayload): Promise<AuthenticatedRequestUser> {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        sessionVersion: true,
      },
    });

    if (!user || user.sessionVersion !== payload.sessionVersion) {
      throw new UnauthorizedException({
        code: 'AUTH_UNAUTHORIZED',
        message: 'Authentication is required.',
      });
    }

    return {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      sessionVersion: user.sessionVersion,
    };
  }
}
