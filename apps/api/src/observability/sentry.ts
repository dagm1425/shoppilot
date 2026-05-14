import * as Sentry from '@sentry/nestjs';
import type { AppEnv } from '../config/env.js';

let sentryInitialized = false;

export function initializeSentry(env: AppEnv): void {
  if (sentryInitialized || env.SENTRY_ENABLED !== 'true') {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    sampleRate: env.SENTRY_SAMPLE_RATE,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE,
  });

  sentryInitialized = true;
}
