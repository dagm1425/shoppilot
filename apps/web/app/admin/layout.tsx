import type { ReactNode } from 'react';
import { AdminSidebarNav } from '../../components/admin-sidebar-nav';
import { AppShell } from '../../components/app-shell';
import { AuthGuard } from '../../components/auth-guard';

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AppShell title="Admin" subtitle="Operations workspace for admin-role users">
      <AuthGuard allowedRoles={['ADMIN']}>
        <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
          <AdminSidebarNav />
          <div className="space-y-6">{children}</div>
        </section>
      </AuthGuard>
    </AppShell>
  );
}
