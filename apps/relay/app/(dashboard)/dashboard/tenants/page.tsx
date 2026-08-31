import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { apiKeys, tenants } from "@/db/schema";
import { CreateTenantForm } from "./create-tenant-form";

export const dynamic = "force-dynamic";

export default async function TenantsPage() {
  const list = await db.select().from(tenants).orderBy(desc(tenants.createdAt));
  const keys = await db.select().from(apiKeys);
  return (
    <div className="space-y-6 p-6">
      <h1 className="text-2xl font-semibold">Tenants</h1>
      <CreateTenantForm />
      <ul className="space-y-3">
        {list.map((t) => {
          const tKeys = keys.filter((k) => k.tenantId === t.id);
          return (
            <li key={t.publicId} className="rounded-md border p-4">
              <div className="font-medium">{t.name}</div>
              <div className="text-muted-foreground text-sm">{t.slug}</div>
              <ul className="mt-2 text-sm">
                {tKeys.map((k) => (
                  <li key={k.publicId}>
                    {k.name}: <code>{k.keyPrefix}…</code>
                    {k.revokedAt ? " (revoked)" : ""}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
