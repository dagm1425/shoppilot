import { safeParsePublicEnv } from '../lib/env';
import { StatePanel } from './state-panel';

export function EnvNotice() {
  const parseResult = safeParsePublicEnv({
    NEXT_PUBLIC_API_BASE_URL: process.env.NEXT_PUBLIC_API_BASE_URL,
    NEXT_PUBLIC_SENTRY_ENABLED: process.env.NEXT_PUBLIC_SENTRY_ENABLED,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_SENTRY_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_SAMPLE_RATE,
    NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE: process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
  });

  if (parseResult.success) {
    return (
      <StatePanel
        variant="success"
        title="Environment ready"
        description="Public environment values are valid for this phase baseline."
      />
    );
  }

  return (
    <StatePanel
      variant="disabled"
      title="Environment needs setup"
      description="One or more public environment values are missing or invalid. See .env.example for required keys."
    />
  );
}
