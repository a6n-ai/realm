/**
 * Adds a second live order for QA customer so Deliveries can show the sub switcher.
 *   pnpm exec vitest run db/seed-qa-second-sub.test.ts
 */
import { describe, it, expect } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { createOrder } from "@/lib/services/orders.service";

const EMAIL = "customer@tiffingrab.ca";

describe("seed QA second subscription", () => {
  it("ensures at least two active/paused orders for QA customer", async () => {
    const [u] = await db.select({ id: users.id, publicId: users.publicId }).from(users).where(eq(users.email, EMAIL)).limit(1);
    expect(u).toBeTruthy();

    const live = await db
      .select({ publicId: orders.publicId })
      .from(orders)
      .where(and(eq(orders.userId, u!.id), inArray(orders.status, ["active", "paused"])));

    if (live.length >= 2) {
      // eslint-disable-next-line no-console
      console.log(`already have ${live.length} live subs`);
      return;
    }

    const snap = await loadCatalogSnapshot();
    const plan = snap.plans.find((p) => p.key !== snap.plans[0]?.key) ?? snap.plans[0]!;
    const mealSize = snap.mealSizes.find((m) => m.planKey === plan.key) ?? snap.mealSizes[0]!;

    const { publicId } = await createOrder(
      {
        planKey: plan.key,
        selections: {
          mealSizeId: mealSize.publicId,
          frequencyKey: "5_day",
          persons: 1,
          mealSlots: ["lunch"],
          includeSaturday: false,
          includeSunday: false,
          durationWeeks: 2,
          startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
        },
        contact: {
          fullName: "QA Customer",
          phone: "+16475550199",
          addressLine: "100 Queen St W",
          city: "Toronto",
          postalCode: "M5H 2N2",
        },
      },
      { ownerUserId: u!.publicId },
    );

    expect(publicId).toMatch(/^ord_/);
    // eslint-disable-next-line no-console
    console.log(`second sub: ${publicId} plan=${plan.name}`);
  }, 60_000);
});
