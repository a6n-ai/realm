import { db } from "@/db/client";
import { notificationTables } from "@/db/schema";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
  const rows = await db.select().from(notificationTables.notificationTemplate);
  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Templates</h1>
      <p className="text-muted-foreground text-sm">
        Per-tenant templates. Transactional sends also accept inline title/body when no template exists.
      </p>
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.publicId} className="rounded-md border p-3 text-sm">
            <span className="font-medium">{r.event}</span> · {r.channel} · {r.locale}
          </li>
        ))}
        {rows.length === 0 ? <li className="text-muted-foreground">No templates yet.</li> : null}
      </ul>
    </div>
  );
}
