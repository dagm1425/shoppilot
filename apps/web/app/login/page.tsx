import { AppShell } from '../../components/app-shell';
import { AuthForm } from '../../components/auth-form';

export default function LoginPage() {
  return (
    <AppShell
      title="Sign in"
      subtitle="Use one account across checkout, orders, and account settings."
      variant="auth"
    >
      <AuthForm mode="login" />
    </AppShell>
  );
}
