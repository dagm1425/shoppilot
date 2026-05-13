import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadEnvFile } from 'node:process';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().positive().default(4000),
  WEB_ORIGIN: z.string().url().default('http://localhost:3000'),
  DATABASE_URL: z.string().url(),
  SENTRY_ENABLED: z.enum(['true', 'false']).default('false'),
  SENTRY_DSN: z.string().optional(),
  JWT_SECRET: z.string().min(32).default('replace-this-development-jwt-secret-1234'),
  AUTH_COOKIE_NAME: z.string().min(1).default('shoppilot_auth'),
  AUTH_COOKIE_TTL_MINUTES: z.coerce.number().int().positive().default(120),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(15),
  AUTH_RESET_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),
  AUTH_RESET_RATE_LIMIT_WINDOW_MINUTES: z.coerce.number().int().positive().default(30),
  AUTH_RESET_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(30),
});

export type AppEnv = z.infer<typeof envSchema>;

let attemptedEnvFileLoad = false;

function tryLoadLocalEnv(input: Record<string, string | undefined>) {
  if (input !== process.env || attemptedEnvFileLoad) {
    return;
  }

  attemptedEnvFileLoad = true;

  const candidates = [
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../.env'),
    resolve(process.cwd(), '../../.env'),
  ];

  for (const path of candidates) {
    if (!existsSync(path)) {
      continue;
    }

    // Local-host dev fallback: API/Web run on the host while only DB runs in Docker.
    // In full Docker/prod runtime, env values should be injected by container/platform;
    // remove this file-loading fallback once runtime env injection is the only path.
    loadEnvFile(path);
    return;
  }
}

export function parseEnv(input: Record<string, string | undefined>): AppEnv {
  tryLoadLocalEnv(input);
  return envSchema.parse(input);
}
