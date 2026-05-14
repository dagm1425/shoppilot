import { parsePublicEnv } from '../../lib/env';

describe('parsePublicEnv', () => {
  it('parses required public env vars', () => {
    const result = parsePublicEnv({
      NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
      NEXT_PUBLIC_SENTRY_ENABLED: 'false',
      NEXT_PUBLIC_SENTRY_DSN: '',
      NEXT_PUBLIC_SENTRY_SAMPLE_RATE: '1',
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: '0.05',
    });

    expect(result.NEXT_PUBLIC_API_BASE_URL).toBe('http://localhost:4000');
  });

  it('throws on invalid url', () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_API_BASE_URL: 'not-a-url',
        NEXT_PUBLIC_SENTRY_ENABLED: 'false',
      }),
    ).toThrow();
  });

  it('requires public DSN when public Sentry is enabled', () => {
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
        NEXT_PUBLIC_SENTRY_ENABLED: 'true',
      }),
    ).toThrow();
  });
});
