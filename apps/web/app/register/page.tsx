import { AppShell } from '../../components/app-shell';
import { AuthForm } from '../../components/auth-form';

export default function RegisterPage() {
  return (
    <AppShell
      title="Create account"
      subtitle="Create your profile to save cart activity and manage orders."
      variant="auth"
    >
      <AuthForm mode="register" />
    </AppShell>
  );
}
