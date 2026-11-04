import { eq, min } from "drizzle-orm";
import { db } from "@/db/client";
import { notificationTables } from "./tables";

/** Earliest scheduled campaign send time: the only work the cron tick owns. null = none scheduled. */
export async function computeNotifyNextAt(): Promise<number | null> {
  const c = notificationTables.campaign;
  const [row] = await db.select({ at: min(c.scheduledAt) }).from(c).where(eq(c.status, "scheduled"));
  return row?.at == null ? null : Number(row.at);
}

/** Earliest next_attempt_at among outbox rows still pending: what a Queue retry waits for. null = none. */
export async function earliestPendingAt(): Promise<number | null> {
  const o = notificationTables.notificationOutbox;
  const [row] = await db.select({ at: min(o.nextAttemptAt) }).from(o).where(eq(o.status, "pending"));
  return row?.at == null ? null : Number(row.at);
}
