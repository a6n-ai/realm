import { describe, expect, it } from "vitest";
import { groupOrderWeeks } from "../order-weeks.service";

const order = (n: string) => ({ orderPublicId: `ord_${n}`, deploymentId: `TG-${n}`, customer: `C ${n}`, mealSize: "Small thali", pricePerTiffin: 12 });

describe("groupOrderWeeks", () => {
  it("sums each order per Monday week, profit = revenue - food - driver, newest week first", () => {
    const weeks = groupOrderWeeks(
      [
        { orderId: 1n, deliveryDate: "2026-11-03", tiffins: 1, revenue: 12, food: 4.95, unrated: false, order: order("1") },
        { orderId: 1n, deliveryDate: "2026-11-05", tiffins: 2, revenue: 24, food: 9.9, unrated: true, order: order("1") },
        { orderId: 2n, deliveryDate: "2026-11-04", tiffins: 1, revenue: 0, food: 4.95, unrated: false, order: order("2") },
        { orderId: 1n, deliveryDate: "2026-11-10", tiffins: 1, revenue: 12, food: 4.95, unrated: false, order: order("1") },
      ],
      3,
    );
    expect(weeks.map((w) => w.key)).toEqual(["2026-11-09", "2026-11-02"]);
    const [, nov2] = weeks;
    // Lowest profit first, so losing orders surface at the top.
    expect(nov2!.orders.map((o) => o.deploymentId)).toEqual(["TG-2", "TG-1"]);
    expect(nov2!.orders[1]).toMatchObject({ tiffins: 3, revenue: 36, food: 14.85, driver: 9, profit: 12.15, unrated: true });
    expect(nov2!.totals).toEqual({ orders: 2, tiffins: 4, revenue: 36, food: 19.8, driver: 12, profit: 4.2 });
  });
});
