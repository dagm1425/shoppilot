import { AppShell } from '../../components/app-shell';
import { ForgotPasswordForm } from '../../components/forgot-password-form';

export default function ForgotPasswordPage() {
  return (
    <AppShell
      title="Password recovery"
      subtitle="Request a secure password reset email"
      variant="auth"
    >
      <ForgotPasswordForm />
    </AppShell>
  );
}
