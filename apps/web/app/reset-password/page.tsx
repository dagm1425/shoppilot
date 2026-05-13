import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
import { ResetPasswordForm } from '../../components/reset-password-form';

type ResetPasswordPageProps = {
  searchParams?: Promise<{
    token?: string;
  }>;
};

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = searchParams ? await searchParams : undefined;

  return (
    <AppShell
      title="Set a new password"
      subtitle="Use your secure reset token to update your account password"
    >
      <ResetPasswordForm initialToken={params?.token} />
      <div className="text-sm text-muted-foreground">
        Need a token first?{' '}
        <Link href="/forgot-password" className="text-primary">
          Request reset token
        </Link>
      </div>
    </AppShell>
  );
}
