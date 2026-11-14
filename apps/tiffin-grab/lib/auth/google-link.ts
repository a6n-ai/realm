import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";

export async function hasGoogleLinked(publicId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: account.id })
    .from(account)
    .innerJoin(users, eq(users.id, account.userId))
    .where(and(eq(users.publicId, publicId), eq(account.providerId, "google")))
    .limit(1);
  return Boolean(row);
}
