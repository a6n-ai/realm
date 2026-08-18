/**
 * Adds a second live order for QA customer so Deliveries can show the sub switcher.
 *
 * A seeding SCRIPT, not a test — excluded from the default run in vitest.config.ts
 * because it creates live rows and depends on a fixture user other suites delete.
 * Run it deliberately (CLI --exclude only ADDS globs, hence the second config):
 *   pnpm --filter tiffin-grab exec vitest run --config vitest.seed.config.ts db/seed-qa-second-sub.test.ts
 *
 * Requires the QA customer to exist — run db/seed-qa-customer.test.ts first.
 */
import { describe, it, expect } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday, parseIsoDateUtc } from "@realm/commons";
import { db } from "@/db/client";
import { orders, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { createOrder } from "@/lib/services/orders.service";
import { assertLocalDb } from "./is-local-db";

// Refuse to run anywhere but a local DB — this creates live orders for a fixture
// account. Throwing at import time means no query runs first.
assertLocalDb("seed-qa-second-sub");

const EMAIL = "customer@tiffingrab.ca";

describe("seed QA second subscription", () => {
  it("ensures at least two active/paused orders for QA customer", async () => {
    const [u] = await db.select({ id: users.id, publicId: users.publicId }).from(users).where(eq(users.email, EMAIL)).limit(1);
    expect(u).toBeTruthy();

    const live = await db
      .select({ publicId: orders.publicId, startDate: orders.startDate, durationWeeks: orders.durationWeeks })
      .from(orders)
      .where(and(eq(orders.userId, u!.id), inArray(orders.status, ["active", "paused"])));

    if (live.length >= 2) {
      // eslint-disable-next-line no-console
      console.log(`already have ${live.length} live subs`);
      return;
    }

    // Concurrent plans are rejected: createOrder refuses an order whose delivery
    // window overlaps a live one, since both would reserve the same calendar days.
    // So this second sub starts after the customer's current plan ends rather
    // than today. nextWeekday() is strictly-after, so passing the (exclusive) end
    // date lands clear of it.
    const lastEnd = live.reduce((max, o) => {
      const end = parseIsoDateUtc(o.startDate);
      end.setUTCDate(end.getUTCDate() + o.durationWeeks * 7);
      return end > max ? end : max;
    }, new Date(0));
    const startDate = nextWeekday(lastEnd > new Date() ? lastEnd : new Date()).toISOString().slice(0, 10);

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
          startDate,
        },
        contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`, 
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
