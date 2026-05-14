import type { ReactNode } from 'react';
import { CustomerNavHeader } from '../../components/customer-nav-header';

type CustomerLayoutProps = {
  children: ReactNode;
};

export default function CustomerLayout({ children }: CustomerLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      <CustomerNavHeader />
      {children}
    </div>
  );
}
