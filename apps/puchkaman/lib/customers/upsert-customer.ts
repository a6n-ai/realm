import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export interface UpsertCustomerInput {
  email: string;
  name?: string | null;
  phone?: string | null;
}

/**
 * Find-or-create the `users` row that owns an order.
 *
 * The row starts with role `user`, no `account` row, and `passwordSet: false`,
 * so it holds no credential until the customer chooses to sign in. It exists so
 * notifications have a recipient and orders have an owner.
 *
 * Called inside the caller's transaction so a customer is never created for an
 * order that rolls back.
 */

/**
 * COALESCE fills blanks only, so a later order with a typo'd name cannot
 * overwrite a good one. The `case` guard is the second half: once a row is a
 * real account (a password was set, or the address was verified), a guest
 * checkout quoting that email may not write to it at all. `role` and `status`
 * are absent by design — an existing staff account sharing the address stays
 * staff, and demoting one would lock a colleague out of the dashboard.
 */
export const customerUpdateSet = {
  name: sql`case when ${users.passwordSet} or ${users.emailVerified} then ${users.name}
             else coalesce(${users.name}, excluded.name) end`,
  phone: sql`case when ${users.passwordSet} or ${users.emailVerified} then ${users.phone}
             else coalesce(${users.phone}, excluded.phone) end`,
};

export async function upsertCustomer(tx: Tx, input: UpsertCustomerInput): Promise<bigint> {
  const email = input.email.trim().toLowerCase();

  const [row] = await tx
    .insert(users)
    .values({
      email,
      name: input.name ?? null,
      phone: input.phone ?? null,
      role: "user",
      status: "active",
      passwordSet: false,
    })
    .onConflictDoUpdate({
      target: users.email,
      // users_email_unique is a PARTIAL index (`where email is not null`).
      // Postgres only infers a partial index when the ON CONFLICT clause repeats
      // its predicate; without this it raises "there is no unique or exclusion
      // constraint matching the ON CONFLICT specification".
      targetWhere: sql`${users.email} is not null`,
      set: customerUpdateSet,
    })
    .returning({ id: users.id });

  if (!row) throw new Error(`upsertCustomer returned no row for ${email}`);
  return row.id;
}
