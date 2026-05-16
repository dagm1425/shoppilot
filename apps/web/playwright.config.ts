import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
  },
  webServer: {
    command: 'pnpm exec next dev --port 3100',
    cwd: __dirname,
    port: 3100,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://127.0.0.1:4000',
      NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED ?? 'false',
      NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? '',
      NEXT_PUBLIC_SENTRY_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE ?? '0',
      NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE:
        process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? '0',
      NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE:
        process.env.NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE ?? '0',
      NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE:
        process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? '0',
      NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE:
        process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? '0',
    },
  },
});
