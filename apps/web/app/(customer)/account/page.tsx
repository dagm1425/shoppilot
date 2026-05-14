import { AccountPanel } from '../../../components/account-panel';
import { AppShell } from '../../../components/app-shell';
import { AuthGuard } from '../../../components/auth-guard';

export default function AccountPage() {
  return (
    <AppShell title="Your account" subtitle="Manage your authenticated session">
      <AuthGuard>
        <AccountPanel />
      </AuthGuard>
    </AppShell>
  );
}
