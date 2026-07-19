/**
 * One-off local QA seed: customer login + one active order.
 * Idempotent by email. Run from apps/tiffin-grab:
 *   pnpm exec vitest run db/seed-qa-customer.test.ts
 *
 * Login: customer@tiffingrab.ca / Customer123!
 */
import { describe, it, expect } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";
import { hashPassword } from "@/lib/auth/password";
import { db } from "@/db/client";
import { account, orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { createOrder } from "@/lib/services/orders.service";

const EMAIL = "customer@tiffingrab.ca";
const PASSWORD = "Customer123!";
const PHONE = "+16475550199";
const NAME = "QA Customer";

describe("seed QA customer", () => {
  it("upserts customer + ensures one live order", async () => {
    const [existing] = await db
      .select({ id: users.id, publicId: users.publicId })
      .from(users)
      .where(eq(users.email, EMAIL))
      .limit(1);

    let publicId: string;
    let userId: bigint;

    if (existing) {
      publicId = existing.publicId;
      userId = existing.id;
      const password = await hashPassword(PASSWORD);
      const [cred] = await db
        .select({ id: account.id })
        .from(account)
        .where(eq(account.userId, userId))
        .limit(1);
      if (cred) {
        await db.update(account).set({ password }).where(eq(account.id, cred.id));
      } else {
        await db.insert(account).values({
          accountId: String(userId),
          providerId: "credential",
          userId,
          password,
        });
      }
      await db
        .update(users)
        .set({ passwordSet: true, emailVerified: true, role: "user", name: NAME, phone: PHONE })
        .where(eq(users.id, userId));
    } else {
      const password = await hashPassword(PASSWORD);
      const [created] = await db
        .insert(users)
        .values({
          name: NAME,
          email: EMAIL,
          phone: PHONE,
          emailVerified: true,
          role: "user",
          passwordSet: true,
        })
        .returning({ id: users.id, publicId: users.publicId });
      expect(created).toBeTruthy();
      userId = created!.id;
      publicId = created!.publicId;
      await db.insert(account).values({
        accountId: String(userId),
        providerId: "credential",
        userId,
        password,
      });
    }

    const [live] = await db
      .select({ publicId: orders.publicId, deploymentId: orders.deploymentId })
      .from(orders)
      .where(and(eq(orders.userId, userId), inArray(orders.status, ["active", "paused"])))
      .limit(1);

    if (live) {
      // eslint-disable-next-line no-console
      console.log(`login: ${EMAIL} / ${PASSWORD}; existing order: ${live.deploymentId}`);
      return;
    }

    const snap = await loadCatalogSnapshot();
    const { deploymentId, publicId: orderPublicId } = await createOrder(
      {
        planKey: snap.plans[0].key,
        selections: {
          mealSizeId: snap.mealSizes[0].publicId,
          frequencyKey: "5_day",
          persons: 1,
          mealSlots: ["lunch"],
          includeSaturday: false,
          includeSunday: false,
          durationWeeks: 2,
          startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
        },
        contact: {
          fullName: NAME,
          phone: PHONE,
          addressLine: "100 Queen St W",
          city: "Toronto",
          postalCode: "M5H 2N2",
        },
      },
      { ownerUserId: publicId },
    );

    expect(deploymentId).toMatch(/^SUB-/);
    expect(orderPublicId).toMatch(/^ord_/);
    // eslint-disable-next-line no-console
    console.log(`login: ${EMAIL} / ${PASSWORD}; order: ${deploymentId}`);
  }, 60_000);
});
