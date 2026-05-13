import { AppShell } from '../../components/app-shell';
import { AuthForm } from '../../components/auth-form';

export default function LoginPage() {
  return (
    <AppShell
      title="Sign in"
      subtitle="Access your ShopPilot account to continue shopping"
    >
      <AuthForm mode="login" />
    </AppShell>
  );
}
