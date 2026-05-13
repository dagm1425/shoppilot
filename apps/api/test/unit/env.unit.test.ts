import { parseEnv } from '../../src/config/env.js';

describe('parseEnv', () => {
  it('parses valid config', () => {
    const parsed = parseEnv({
      NODE_ENV: 'development',
      API_PORT: '4000',
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/shoppilot',
      SENTRY_ENABLED: 'false',
    });

    expect(parsed.API_PORT).toBe(4000);
    expect(parsed.SENTRY_ENABLED).toBe('false');
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
});
