export function AdminPanel() {
  return (
    <section className="rounded-lg border bg-card p-6">
      <h2 className="text-lg font-semibold text-card-foreground">Admin workspace</h2>
      <p className="mt-2 text-sm text-muted-foreground">
        This protected surface is visible only to admin-role accounts in Phase 1.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Authorized sessions can use this page to validate role-based routing behavior.
      </p>
      {/* future: granular permissions matrix - phase 1 uses coarse role checks only */}
    </section>
  );
}
