import type { Metadata } from 'next';
import './globals.css';
import { GlobalToaster } from '../components/global-toaster';

export const metadata: Metadata = {
  title: 'ShopPilot Foundation',
  description: 'Phase 0 foundation diagnostics UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <GlobalToaster />
      </body>
    </html>
  );
}
