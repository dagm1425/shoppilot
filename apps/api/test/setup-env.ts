process.env.NODE_ENV = 'test';
process.env.API_PORT = process.env.API_PORT ?? '4000';
process.env.WEB_ORIGIN = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://postgres:postgres@localhost:5432/shoppilot';
process.env.SENTRY_ENABLED = process.env.SENTRY_ENABLED ?? 'false';
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? 'replace-this-development-jwt-secret-1234';
process.env.AUTH_COOKIE_NAME = process.env.AUTH_COOKIE_NAME ?? 'shoppilot_auth';
process.env.AUTH_COOKIE_TTL_MINUTES = process.env.AUTH_COOKIE_TTL_MINUTES ?? '120';
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '10';
process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES =
  process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES ?? '15';
process.env.AUTH_RESET_RATE_LIMIT_MAX = process.env.AUTH_RESET_RATE_LIMIT_MAX ?? '5';
process.env.AUTH_RESET_RATE_LIMIT_WINDOW_MINUTES =
  process.env.AUTH_RESET_RATE_LIMIT_WINDOW_MINUTES ?? '30';
process.env.AUTH_RESET_TOKEN_TTL_MINUTES = process.env.AUTH_RESET_TOKEN_TTL_MINUTES ?? '30';
process.env.SKIP_DB_CONNECT = process.env.SKIP_DB_CONNECT ?? 'true';
