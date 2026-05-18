import type { ReactNode } from 'react';
import { AdminSidebarNav } from '../../components/admin-sidebar-nav';
import { AppShell } from '../../components/app-shell';
import { AuthGuard } from '../../components/auth-guard';
import { CustomerNavHeader } from '../../components/customer-nav-header';

type AdminLayoutProps = {
  children: ReactNode;
};

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AuthGuard allowedRoles={['ADMIN']}>
      <>
        <CustomerNavHeader />
        <AppShell title="Admin" subtitle="Operations workspace for admin-role users">
          <section className="grid gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
            <AdminSidebarNav />
            <div className="space-y-6">{children}</div>
          </section>
        </AppShell>
      </>
    </AuthGuard>
  );
}
