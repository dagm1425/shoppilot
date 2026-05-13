import Link from 'next/link';
import { AppShell } from '../../components/app-shell';
import { ForgotPasswordForm } from '../../components/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <AppShell
      title="Password recovery"
      subtitle="Request a secure password reset email"
    >
      <ForgotPasswordForm />
      <div className="text-sm text-muted-foreground">
        Remembered your password?{' '}
        <Link href="/login" className="text-primary">
          Back to sign in
        </Link>
      </div>
    </AppShell>
  );
}
