import { describe, expect, it } from "vitest";
import { countsWithAddons, orderAddonValues } from "../order-addon-items";

describe("countsWithAddons", () => {
  it("adds one row per add-on qty to its category", () => {
    expect(countsWithAddons({ sabzi: 1, roti: 4 }, [{ category: "sabzi", qty: 1 }, { category: "roti", qty: 2 }])).toEqual({ sabzi: 2, roti: 6 });
  });

  it("leaves the meal's counts alone with no add-ons", () => {
    expect(countsWithAddons({ sabzi: 1 }, [])).toEqual({ sabzi: 1 });
  });
});

describe("orderAddonValues", () => {
  it("bills price per tiffin × qty × tiffins and snapshots category and portion", () => {
    const [row] = orderAddonValues(
      7n,
      [{ key: "extra_sabzi", name: "Extra Sabzi", category: "sabzi", tuAmount: 1, pricePerTiffin: 2.5, qty: 2 }],
      20,
      "org_1",
    );
    expect(row).toMatchObject({ orderId: 7n, category: "sabzi", tuAmount: "1.00", pricePerTiffin: "2.50", qty: 2, amount: "100.00" });
  });
});

describe("addonItemsForOrder (integration)", () => {
  const DEPLOY = "test-order-addon-items";
  const PREFIX = "order-addon-items-";

  it("expands each add-on qty into a row after the meal's rows, on the order's plan", async () => {
    const { eq } = await import("drizzle-orm");
    const { db } = await import("@/db/client");
    const { orderAddons } = await import("@/db/schema");
    const { addonItemsForOrder, ADDON_SORT_BASE } = await import("../order-addon-items");
    const { makeTripOrder, resetTrips } = await import("@/lib/services/__tests__/trip-fixture");
    await resetTrips(DEPLOY, PREFIX);
    try {
      const { order } = await makeTripOrder(DEPLOY, PREFIX);
      await db.insert(orderAddons).values(orderAddonValues(order.id, [
        { key: "extra_sabzi", name: "Extra Sabzi", category: "sabzi", tuAmount: 1, pricePerTiffin: 3, qty: 2 },
        { key: "extra_roti", name: "Extra Roti", category: "roti", tuAmount: 2, pricePerTiffin: 1, qty: 1 },
      ], 7, null));

      const rows = await addonItemsForOrder(order.id);
      expect(rows.map((r) => [r.category, r.tuAmount])).toEqual([["sabzi", "1.00"], ["sabzi", "1.00"], ["roti", "2.00"]]);
      expect(rows.every((r) => r.sortOrder >= ADDON_SORT_BASE && r.planId === order.planId)).toBe(true);
      await db.delete(orderAddons).where(eq(orderAddons.orderId, order.id));
    } finally {
      await resetTrips(DEPLOY, PREFIX);
    }
  });
});
