'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '../lib/utils';

type AdminNavItem = {
  href: string;
  label: string;
};

const navItems: AdminNavItem[] = [
  { href: '/admin', label: 'Home' },
  { href: '/admin/products', label: 'Products' },
  { href: '/admin/orders', label: 'Orders' },
];

function isActive(pathname: string, href: string): boolean {
  if (href === '/admin') {
    return pathname === '/admin';
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AdminSidebarNav() {
  const pathname = usePathname();

  return (
    <aside className="rounded-lg border bg-card p-4">
      <p className="font-auth-heading text-xs font-bold uppercase tracking-[0.08em] text-muted-foreground">
        Workspace
      </p>
      <nav className="mt-3 space-y-1" aria-label="Admin navigation">
        {navItems.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? 'page' : undefined}
            className={cn(
                'flex items-center rounded-md border px-3 py-2 text-sm transition-colors',
                active
                  ? 'border-foreground/20 bg-muted text-foreground'
                  : 'border-transparent text-muted-foreground hover:border-border hover:bg-muted hover:text-foreground',
              )}
            >
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
