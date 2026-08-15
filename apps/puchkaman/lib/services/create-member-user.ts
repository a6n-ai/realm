import { db } from "@/db/client";
import { users } from "@/db/schema";

/**
 * Mints a `member` auth account for a Clover employee. Mirrors
 * `upsertCustomer` (insert, no `account` row, no credential) but with the
 * staff `member` role and a plain insert rather than an upsert — the caller
 * already confirmed no live row matches this email, so there is nothing to
 * merge into.
 *
 * Created `inactive`, and that is the whole gate. `passwordSet: false` is not
 * one: /login offers email-OTP sign-in to any address, so an `active` row would
 * let whoever controls that mailbox sign in and hold a `member` session —
 * meaning anyone able to edit an employee's email in the Clover merchant
 * dashboard could grant themselves console access. `decideSessionAdmission`
 * refuses a non-active account, so nothing can sign in until an admin flips the
 * row to active from the users list.
 */
export async function createMemberUser(email: string, name: string): Promise<bigint> {
  const [row] = await db
    .insert(users)
    .values({
      email,
      name,
      role: "member",
      status: "inactive",
      passwordSet: false,
    })
    .returning({ id: users.id });

  if (!row) throw new Error(`createMemberUser returned no row for ${email}`);
  return row.id;
}
