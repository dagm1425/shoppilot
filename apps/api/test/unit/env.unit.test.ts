import { parseEnv } from '../../src/config/env.js';

describe('parseEnv', () => {
  it('parses valid config', () => {
    const parsed = parseEnv({
      NODE_ENV: 'development',
      API_PORT: '4000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/shoppilot',
      SENTRY_ENABLED: 'false',
      RESEND_API_KEY: 're_test_dummy_api_key',
    });

    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.SENTRY_ENABLED).toBe('false');
    expect(parsed.AUTH_COOKIE_TTL_REMEMBER_MINUTES).toBe(43_200);
  });

  it('throws for missing database url', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        API_PORT: '4000',
        SENTRY_ENABLED: 'false',
      }),
    ).toThrow();
  });

  it('requires SENTRY_DSN when SENTRY_ENABLED=true', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        API_PORT: '4000',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/shoppilot',
        SENTRY_ENABLED: 'true',
        RESEND_API_KEY: 're_test_dummy_api_key',
      }),
    ).toThrow();
  });

  it('accepts Sentry enabled config with DSN and sample rates', () => {
    const parsed = parseEnv({
      NODE_ENV: 'development',
      API_PORT: '4000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/shoppilot',
      SENTRY_ENABLED: 'true',
      SENTRY_DSN: 'https://public@example.ingest.sentry.io/1',
      SENTRY_SAMPLE_RATE: '1',
      SENTRY_TRACES_SAMPLE_RATE: '0.05',
      SENTRY_PROFILES_SAMPLE_RATE: '0.1',
      RESEND_API_KEY: 're_test_dummy_api_key',
    });

    expect(parsed.SENTRY_ENABLED).toBe('true');
    expect(parsed.SENTRY_SAMPLE_RATE).toBe(1);
    expect(parsed.SENTRY_TRACES_SAMPLE_RATE).toBe(0.05);
    expect(parsed.SENTRY_PROFILES_SAMPLE_RATE).toBe(0.1);
  });

  it('requires RESEND_API_KEY', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'development',
        API_PORT: '4000',
        DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/shoppilot',
        SENTRY_ENABLED: 'false',
      }),
    ).toThrow();
  });

  it('accepts config when RESEND_API_KEY is provided', () => {
    parseEnv({
      NODE_ENV: 'development',
      API_PORT: '4000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/shoppilot',
      SENTRY_ENABLED: 'false',
      EMAIL_FROM_ADDRESS: 'onboarding@resend.dev',
      RESEND_API_KEY: 're_test_dummy_api_key',
    });
  });
});
