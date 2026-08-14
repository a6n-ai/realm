import { db } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Mints a `member` auth account for a Clover employee. Mirrors
 * `upsertCustomer` (insert, no `account` row, no credential) but with the
 * staff `member` role and a plain insert rather than an upsert — the caller
 * already confirmed no live row matches this email, so there is nothing to
 * merge into. Sends no invite: `passwordSet: false` just means the account
 * has no way in yet; the admin invites it later on their own schedule.
 */
export async function createMemberUser(email: string, name: string): Promise<bigint> {
  const [row] = await db
    .insert(users)
    .values({
      email,
      name,
      role: "member",
      status: "active",
      passwordSet: false,
    })
    .returning({ id: users.id });

  if (!row) throw new Error(`createMemberUser returned no row for ${email}`);
  return row.id;
}
