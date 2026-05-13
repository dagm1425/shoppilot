import Link from 'next/link';
import { AppShell } from '../components/app-shell';

export default function NotFoundPage() {
  return (
    <AppShell
      title="Page not found"
      subtitle="The route you requested does not exist in this phase baseline."
    >
      <Link href="/" className="inline-flex w-fit rounded-md border px-4 py-2 text-sm">
        Back to home
      </Link>
    </AppShell>
  );
}
