import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, ledgerEntries, orders, payments, users } from "@/db/schema";
import { loadCatalogSnapshot } from "@/lib/catalog/load";

vi.unmock("@/lib/services/start-date");
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { createOrder } = await import("../orders.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

describe("createOrder: the cutoff hour closes tomorrow as a start date", () => {
  beforeEach(reset);
  afterEach(() => vi.useRealTimers());
  afterAll(reset);

  it("takes tomorrow before the cutoff and refuses it after", async () => {
    const snap = await loadCatalogSnapshot();
    const order = (startDate: string) => createOrder({
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day" as const, persons: 1, mealSlots: ["lunch"],
        includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate,
      },
      contact: { email: "cutoff@test.invalid", fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    // Tue Oct 13, 2026 in Toronto (UTC-4), one minute either side of the cutoff hour.
    const cutoff = Date.UTC(2026, 9, 13, (snap.cutoffHour ?? 18) + 4);

    vi.useFakeTimers({ toFake: ["Date"], now: cutoff + 60_000 });
    await expect(order("2026-10-14")).rejects.toThrow(/on or after the next available weekday/);

    vi.setSystemTime(cutoff - 60_000);
    await expect(order("2026-10-14")).resolves.toMatchObject({ publicId: expect.stringMatching(/^ord_/) });
  });

  it("gives staff no same-day start: today's cutoff has already passed", async () => {
    const snap = await loadCatalogSnapshot();
    vi.useFakeTimers({ toFake: ["Date"], now: Date.UTC(2026, 9, 13, 14) }); // Tue Oct 13, 10 AM in Toronto
    await expect(createOrder({
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day" as const, persons: 1, mealSlots: ["lunch"],
        includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: "2026-10-13",
      },
      contact: { email: "today@test.invalid", fullName: "A B", phone: "+16475550112", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    })).rejects.toThrow(/on or after the next available weekday/);
  });
});
