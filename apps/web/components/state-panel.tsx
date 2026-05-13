import type { ReactNode } from 'react';

type PanelVariant = 'loading' | 'empty' | 'error' | 'success' | 'disabled';

type StatePanelProps = {
  variant: PanelVariant;
  title: string;
  description: string;
  children?: ReactNode;
};

const variantClasses: Record<PanelVariant, string> = {
  loading: 'border-muted bg-muted/50 text-foreground',
  empty: 'border-border bg-card text-card-foreground',
  error: 'border-danger/40 bg-danger/10 text-foreground',
  success: 'border-success/40 bg-success/10 text-foreground',
  disabled: 'border-warning/40 bg-warning/10 text-foreground',
};

export function StatePanel({ variant, title, description, children }: StatePanelProps) {
  return (
    <section className={`rounded-lg border p-4 ${variantClasses[variant]}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      {children ? <div className="mt-3">{children}</div> : null}
    </section>
  );
}
