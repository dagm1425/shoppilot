import { StatePanel } from './state-panel';

type HealthPayload = {
  status: string;
  service: string;
  timestamp: string;
};

type StatusCardProps = {
  loading: boolean;
  payload?: HealthPayload;
  errorMessage?: string;
};

export function StatusCard({ loading, payload, errorMessage }: StatusCardProps) {
  if (loading) {
    return (
      <StatePanel
        variant="loading"
        title="Running health probe"
        description="Checking API availability and baseline readiness."
      />
    );
  }

  if (errorMessage) {
    return (
      <StatePanel
        variant="error"
        title="Health probe failed"
        description={errorMessage}
      />
    );
  }

  if (!payload) {
    return (
      <StatePanel
        variant="empty"
        title="No health data"
        description="Start the API and refresh this page to run diagnostics."
      />
    );
  }

  return (
    <StatePanel
      variant="success"
      title="Stack healthy"
      description={`Service ${payload.service} responded at ${payload.timestamp}`}
    />
  );
}
