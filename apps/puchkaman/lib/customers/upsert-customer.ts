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
 * Find-or-create the `users` row that owns a guest order.
 *
 * The account is deliberately unusable for sign-in: role `user`, no `account`
 * row (so no credential exists), and the session.create.before hook rejects the
 * role outright. It exists so notifications have a recipient and orders have an
 * owner — not to give customers a login.
 *
 * Called inside the caller's transaction so a customer is never created for an
 * order that rolls back.
 */
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
    // COALESCE keeps the stored value when it is already set: a later order with
    // a typo'd name must not overwrite the good one. `role` is deliberately
    // absent from the update — an existing staff account sharing the address
    // stays staff, and demoting one would lock a colleague out of the dashboard.
    .onConflictDoUpdate({
      target: users.email,
      // users_email_unique is a PARTIAL index (`where email is not null`).
      // Postgres only infers a partial index when the ON CONFLICT clause repeats
      // its predicate; without this it raises "there is no unique or exclusion
      // constraint matching the ON CONFLICT specification".
      targetWhere: sql`${users.email} is not null`,
      set: {
        name: sql`coalesce(${users.name}, excluded.name)`,
        phone: sql`coalesce(${users.phone}, excluded.phone)`,
      },
    })
    .returning({ id: users.id });

  if (!row) throw new Error(`upsertCustomer returned no row for ${email}`);
  return row.id;
}
