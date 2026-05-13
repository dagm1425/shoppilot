import { z } from 'zod';

const webEnvSchema = z.object({
  NEXT_PUBLIC_API_BASE_URL: z.string().url(),
  NEXT_PUBLIC_SENTRY_ENABLED: z.enum(['true', 'false']).default('false'),
  NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

export function parsePublicEnv(input: Record<string, string | undefined>) {
  return webEnvSchema.parse(input);
}

export function safeParsePublicEnv(input: Record<string, string | undefined>) {
  return webEnvSchema.safeParse(input);
}
