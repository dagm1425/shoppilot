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
process.env.AUTH_RATE_LIMIT_MAX = process.env.AUTH_RATE_LIMIT_MAX ?? '40';
process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES =
  process.env.AUTH_RATE_LIMIT_WINDOW_MINUTES ?? '15';
process.env.AUTH_RESET_RATE_LIMIT_MAX = process.env.AUTH_RESET_RATE_LIMIT_MAX ?? '5';
process.env.AUTH_RESET_RATE_LIMIT_WINDOW_MINUTES =
  process.env.AUTH_RESET_RATE_LIMIT_WINDOW_MINUTES ?? '30';
process.env.AUTH_RESET_TOKEN_TTL_MINUTES = process.env.AUTH_RESET_TOKEN_TTL_MINUTES ?? '30';
process.env.STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY ?? 'sk_test_dummy';
process.env.EMAIL_FROM_ADDRESS = process.env.EMAIL_FROM_ADDRESS ?? 'onboarding@resend.dev';
process.env.EMAIL_FROM_NAME = process.env.EMAIL_FROM_NAME ?? 'ShopPilot';
process.env.EMAIL_RESET_BASE_URL =
  process.env.EMAIL_RESET_BASE_URL ?? 'http://localhost:3000/reset-password';
process.env.RESEND_API_KEY = process.env.RESEND_API_KEY ?? 're_test_dummy_api_key';
process.env.SKIP_DB_CONNECT = process.env.SKIP_DB_CONNECT ?? 'true';
