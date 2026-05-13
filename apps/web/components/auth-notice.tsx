type NoticeVariant = 'success' | 'error' | 'info';

type AuthNoticeProps = {
  variant: NoticeVariant;
  message: string;
};

const variantClasses: Record<NoticeVariant, string> = {
  success: 'border-success/40 bg-success/10 text-foreground',
  error: 'border-danger/40 bg-danger/10 text-foreground',
  info: 'border-muted bg-muted/50 text-foreground',
};

export function AuthNotice({ variant, message }: AuthNoticeProps) {
  return (
    <div className={`rounded-md border px-3 py-2 text-sm ${variantClasses[variant]}`}>
      {message}
    </div>
  );
}
