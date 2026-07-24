"use server";

import { eq, and } from "drizzle-orm";
import { passwordSchema } from "@realm/commons";
import { hashPassword } from "@realm/auth";
import { db } from "@/db/client";
import { account, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";

// First-login: the signed-in user sets their own password, replacing the issued
// default. No current-password prompt (they authenticated with the temp one
// already). Scoped to the session's own id — never a client-supplied user.
export async function setInitialPassword(newPassword: string): Promise<{ ok: true } | { error: string }> {
  const session = await getSession();
  if (!session?.user) return { error: "Your session has expired. Please sign in again." };
  const parsed = passwordSchema.safeParse(newPassword);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid password" };

  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.publicId, session.user.id)).limit(1);
  if (!u) return { error: "Your session has expired. Please sign in again." };

  const hash = await hashPassword(parsed.data);
  await db.transaction(async (tx) => {
    const [acct] = await tx
      .select({ id: account.id })
      .from(account)
      .where(and(eq(account.userId, u.id), eq(account.providerId, "credential")))
      .limit(1);
    if (acct) {
      await tx.update(account).set({ password: hash }).where(eq(account.id, acct.id));
    } else {
      await tx.insert(account).values({
        accountId: String(u.id),
        providerId: "credential",
        userId: u.id,
        password: hash,
      });
    }
    await tx.update(users).set({ passwordSet: true }).where(eq(users.id, u.id));
  });

  return { ok: true };
}
