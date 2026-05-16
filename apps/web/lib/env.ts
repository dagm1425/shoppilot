import { z } from 'zod';

const webEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_SENTRY_ENABLED: z.enum(['true', 'false']).default('false'),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
  NEXT_PUBLIC_SENTRY_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  NEXT_PUBLIC_SENTRY_PROFILES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  NEXT_PUBLIC_SENTRY_REPLAYS_SESSION_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  NEXT_PUBLIC_SENTRY_REPLAYS_ON_ERROR_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
}).superRefine((input, context) => {
  if (input.NEXT_PUBLIC_SENTRY_ENABLED !== 'true') {
    return;
  }

  if (!input.NEXT_PUBLIC_SENTRY_DSN || input.NEXT_PUBLIC_SENTRY_DSN.trim().length === 0) {
    context.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['NEXT_PUBLIC_SENTRY_DSN'],
      message: 'NEXT_PUBLIC_SENTRY_DSN is required when NEXT_PUBLIC_SENTRY_ENABLED=true.',
    });
  }
});

export function parsePublicEnv(input: Record<string, string | undefined>) {
  return webEnvSchema.parse(input);
}

export function safeParsePublicEnv(input: Record<string, string | undefined>) {
  return webEnvSchema.safeParse(input);
}
