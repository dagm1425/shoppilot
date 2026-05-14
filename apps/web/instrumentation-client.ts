import * as Sentry from '@sentry/nextjs';

const sentryEnabled = process.env.NEXT_PUBLIC_SENTRY_ENABLED === 'true';
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (sentryEnabled && dsn) {
  Sentry.init({
    dsn,
    sampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE ?? 1),
    tracesSampleRate: Number(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
    enabled: true,
  });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;

