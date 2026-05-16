import { buildAuthCookieOptions, computeResetTokenExpiry } from '../../src/auth/auth-cookie.js';
import { parseEnv } from '../../src/config/env.js';

describe('auth cookie and expiry helpers', () => {
  it('builds secure cookie options in production', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      API_PORT: '4000',
      WEB_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/shoppilot',
      SENTRY_ENABLED: 'false',
      JWT_SECRET: 'replace-this-development-jwt-secret-1234',
      AUTH_COOKIE_NAME: 'shoppilot_auth',
      AUTH_COOKIE_TTL_MINUTES: '120',
      AUTH_RATE_LIMIT_MAX: '10',
      AUTH_RATE_LIMIT_WINDOW_MINUTES: '15',
      AUTH_RESET_RATE_LIMIT_MAX: '5',
      AUTH_RESET_RATE_LIMIT_WINDOW_MINUTES: '30',
      AUTH_RESET_TOKEN_TTL_MINUTES: '30',
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      RESEND_API_KEY: 're_test_dummy_api_key',
    });

    const options = buildAuthCookieOptions(env);

    expect(options.httpOnly).toBe(true);
    expect(options.secure).toBe(true);
    expect(options.sameSite).toBe('lax');
    expect(options.maxAge).toBe(7_200_000);
  });

  it('supports explicit remember-me ttl override', () => {
    const env = parseEnv({
      NODE_ENV: 'production',
      API_PORT: '4000',
      WEB_ORIGIN: 'http://localhost:3000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/shoppilot',
      SENTRY_ENABLED: 'false',
      JWT_SECRET: 'replace-this-development-jwt-secret-1234',
      AUTH_COOKIE_NAME: 'shoppilot_auth',
      AUTH_COOKIE_TTL_MINUTES: '120',
      AUTH_COOKIE_TTL_REMEMBER_MINUTES: '43200',
      AUTH_RATE_LIMIT_MAX: '10',
      AUTH_RATE_LIMIT_WINDOW_MINUTES: '15',
      AUTH_RESET_RATE_LIMIT_MAX: '5',
      AUTH_RESET_RATE_LIMIT_WINDOW_MINUTES: '30',
      AUTH_RESET_TOKEN_TTL_MINUTES: '30',
      STRIPE_SECRET_KEY: 'sk_test_dummy',
      RESEND_API_KEY: 're_test_dummy_api_key',
    });

    const options = buildAuthCookieOptions(env, env.AUTH_COOKIE_TTL_REMEMBER_MINUTES);
    expect(options.maxAge).toBe(2_592_000_000);
  });

  it('computes reset token expiry in minutes', () => {
    const now = Date.UTC(2026, 4, 4, 12, 0, 0);
    const expiresAt = computeResetTokenExpiry(30, now);

    expect(expiresAt.getTime()).toBe(now + 30 * 60_000);
  });
});
