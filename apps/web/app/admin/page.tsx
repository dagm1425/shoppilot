import { AdminPanel } from '../../components/admin-panel';
import { AppShell } from '../../components/app-shell';
import { AuthGuard } from '../../components/auth-guard';

export default function AdminPage() {
  return (
    <AppShell title="Admin" subtitle="Protected workspace for admin-role users">
      <AuthGuard allowedRoles={['ADMIN']}>
        <AdminPanel />
      </AuthGuard>
    </AppShell>
  );
}
