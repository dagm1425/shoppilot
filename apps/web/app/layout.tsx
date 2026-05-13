import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShopPilot Foundation',
  description: 'Phase 0 foundation diagnostics UI',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
