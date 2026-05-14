import * as Sentry from '@sentry/nextjs';

type ReportClientErrorInput = {
  error: unknown;
  context: string;
};

export function reportClientError({ error, context }: ReportClientErrorInput): void {
  if (process.env.NODE_ENV === 'development') {
    console.error(`[${context}]`, error);
  }

  Sentry.captureException(error);
}
