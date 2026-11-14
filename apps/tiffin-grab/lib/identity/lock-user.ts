import { sql } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { users } from "@/db/schema";

/** Row lock on a customer. Take the order advisory lock (lockOrder) first; lock several users together with lockUsers. */
export async function lockUser(tx: Tx, userId: bigint): Promise<void> {
  await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${userId} FOR UPDATE`);
}

/** Locks users in id order so two transactions locking the same pair cannot deadlock. */
export async function lockUsers(tx: Tx, userIds: bigint[]): Promise<void> {
  const ids = [...userIds].sort((a, b) => (a < b ? -1 : 1));
  await tx.execute(sql`SELECT id FROM ${users} WHERE id IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)}) ORDER BY id FOR UPDATE`);
}
