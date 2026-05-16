import * as Sentry from '@sentry/nextjs';

const sentryEnabled =
  process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true'
  && process.env.NODE_ENV !== 'test'
  && process.env.CI !== 'true';
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (sentryEnabled && dsn) {
  Sentry.init({
    dsn,
    sampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE ?? 0),
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0),
    profilesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE ?? 0),
    replaysSessionSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE ?? 0,
    ),
    replaysOnErrorSampleRate: Number(
      process.env.NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE ?? 0,
    ),
    enabled: true,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
