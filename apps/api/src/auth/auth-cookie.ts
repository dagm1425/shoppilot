import type { CookieOptions } from 'express';
import type { AppEnv } from '../config/env.js';

export function buildAuthCookieOptions(
  env: AppEnv,
  ttlMinutes = env.AUTH_COOKIE_TTL_MINUTES,
): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    maxAge: ttlMinutes * 60_000,
    path: '/',
  };
}

export function computeResetTokenExpiry(minutes: number, now = Date.now()): Date {
  return new Date(now + minutes * 60_000);
}
