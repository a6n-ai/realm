import { describe, expect, it } from "vitest";
import { splitOrders, type MyOrderSummary } from "../my-orders";

const order = (over: Partial<MyOrderSummary>): MyOrderSummary => ({
  publicId: "ord_1",
  reference: "ord_1",
  placedAt: new Date("2026-08-01T10:00:00Z"),
  status: "paid",
  total: 24.5,
  itemCount: 3,
  ongoing: true,
  ...over,
});

describe("splitOrders", () => {
  it("puts ongoing orders first and terminal ones in past", () => {
    const rows = [
      order({ publicId: "ord_done", ongoing: false }),
      order({ publicId: "ord_live", ongoing: true }),
    ];
    const { ongoing, past } = splitOrders(rows);
    expect(ongoing.map((o) => o.publicId)).toEqual(["ord_live"]);
    expect(past.map((o) => o.publicId)).toEqual(["ord_done"]);
  });

  it("keeps each group newest-first", () => {
    const rows = [
      order({ publicId: "old", ongoing: false, placedAt: new Date("2026-01-01") }),
      order({ publicId: "new", ongoing: false, placedAt: new Date("2026-08-01") }),
    ];
    expect(splitOrders(rows).past.map((o) => o.publicId)).toEqual(["new", "old"]);
  });

  it("returns empty groups rather than undefined for a customer with no orders", () => {
    expect(splitOrders([])).toEqual({ ongoing: [], past: [] });
  });
});
