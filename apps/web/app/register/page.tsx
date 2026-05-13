import { AppShell } from '../../components/app-shell';
import { AuthForm } from '../../components/auth-form';

export default function RegisterPage() {
  return (
    <AppShell
      title="Create account"
      subtitle="Register to save your cart and track orders"
    >
      <AuthForm mode="register" />
    </AppShell>
  );
}
