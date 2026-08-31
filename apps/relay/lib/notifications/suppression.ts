import { db } from "@/db/client";
import { notificationTables, tenants } from "@/db/schema";

export async function suppressEmailRecipient(address: string, reason: string): Promise<void> {
  const all = await db.select({ id: tenants.id }).from(tenants);
  const normalized = address.trim().toLowerCase();
  for (const t of all) {
    await db
      .insert(notificationTables.messageSuppression)
      .values({
        tenantId: t.id,
        address: normalized,
        channel: "email",
        scope: "all",
        reason,
      })
      .onConflictDoNothing();
  }
}
