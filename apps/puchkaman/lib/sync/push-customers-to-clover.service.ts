/**
 * Push app customers (`users` role "user") to Clover as customers.
 * One-way create only, matching createCustomer's "no update" scope — a
 * customer already pushed (cloverCustomerId set) is skipped on the bulk run,
 * not re-created or patched. Mirrors clover-customers-sync.service.ts's pull,
 * opposite direction.
 */

import { eq, isNull, and } from "drizzle-orm";
import type { CloverApiClient } from "@realm/clover";
import { db } from "@/db/client";
import { users } from "@/db/schema";

export type PushCustomerResult = { cloverCustomerId: string };
export type PushAllCustomersResult = {
  pushed: number;
  skipped: number;
  errors: Array<{ publicId: string; message: string }>;
};

class PushCustomersToCloverService {
  /** Push one customer. Throws if already synced — callers check first for a clear message. */
  async pushOne(client: CloverApiClient, publicId: string): Promise<PushCustomerResult> {
    const [row] = await db
      .select()
      .from(users)
      .where(and(eq(users.publicId, publicId), eq(users.role, "user")))
      .limit(1);
    if (!row) throw new Error(`Customer not found: ${publicId}`);
    if (row.cloverCustomerId) throw new Error("This customer is already synced to Clover.");

    const cloverCustomerId = await this.createOnClover(client, row);
    return { cloverCustomerId };
  }

  async pushAll(client: CloverApiClient): Promise<PushAllCustomersResult> {
    const result: PushAllCustomersResult = { pushed: 0, skipped: 0, errors: [] };
    const rows = await db
      .select()
      .from(users)
      .where(and(eq(users.role, "user"), isNull(users.cloverCustomerId)));

    for (const row of rows) {
      try {
        await this.createOnClover(client, row);
        result.pushed += 1;
      } catch (err) {
        result.errors.push({
          publicId: row.publicId,
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }
    result.skipped = rows.length - result.pushed - result.errors.length;
    return result;
  }

  private async createOnClover(
    client: CloverApiClient,
    row: typeof users.$inferSelect,
  ): Promise<string> {
    const [firstName, ...rest] = (row.name ?? "").trim().split(/\s+/).filter(Boolean);
    const created = await client.createCustomer({
      firstName: firstName || undefined,
      lastName: rest.join(" ") || undefined,
      email: row.email ?? undefined,
      phone: row.phone ?? undefined,
    });
    await db
      .update(users)
      .set({ cloverCustomerId: created.id, cloverSyncedAt: Date.now() })
      .where(eq(users.id, row.id));
    return created.id;
  }
}

export const pushCustomersToCloverService = new PushCustomersToCloverService();
