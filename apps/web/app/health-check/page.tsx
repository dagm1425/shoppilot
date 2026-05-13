import { AppShell } from '../../components/app-shell';
import { StatusCard } from '../../components/status-card';

type HealthResponse = {
  status: string;
  service: string;
  timestamp: string;
};

async function getHealth(): Promise<{ payload?: HealthResponse; error?: string }> {
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  if (!apiBase) {
    return { error: 'NEXT_PUBLIC_API_BASE_URL is missing.' };
  }

  try {
    const response = await fetch(`${apiBase}/health`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return { error: `API responded with status ${response.status}.` };
    }

    const payload = (await response.json()) as HealthResponse;
    return { payload };
  } catch {
    return { error: 'Unable to reach API health endpoint.' };
  }
}

export default async function HealthCheckPage() {
  const { payload, error } = await getHealth();

  return (
    <AppShell
      title="Health Check"
      subtitle="Validates API baseline contract and runtime connectivity"
    >
      <StatusCard loading={false} payload={payload} errorMessage={error} />
    </AppShell>
  );
}
