import { AppShell } from '../../components/app-shell';
import { AuthForm } from '../../components/auth-form';

type LoginPageProps = {
  searchParams?: Promise<{
    redirect?: string | string[];
  }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const resolvedSearchParams = await searchParams;
  const redirectParam = Array.isArray(resolvedSearchParams?.redirect)
    ? resolvedSearchParams.redirect[0] ?? null
    : resolvedSearchParams?.redirect ?? null;

  return (
    <AppShell
      title="Sign in"
      subtitle="Use one account across checkout, orders, and account settings."
      variant="auth"
    >
      <AuthForm mode="login" postLoginRedirect={redirectParam} />
    </AppShell>
  );
}
