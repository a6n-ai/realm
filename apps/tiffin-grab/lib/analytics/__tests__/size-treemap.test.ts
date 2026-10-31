import { describe, expect, it } from "vitest";
import { buildSizeTreemap, treemapTotal, type SizeSale } from "../size-treemap";

const rows: SizeSale[] = [
  { plan: "Non-Veg", size: "Maharaja Thali", custom: false, revenue: 300.1, tiffins: 10 },
  { plan: "Pure Vegetarian", size: "4 Item Thali", custom: false, revenue: 200.2, tiffins: 30 },
  { plan: "Pure Vegetarian", size: "Custom A", custom: true, revenue: 10.15, tiffins: 1 },
  { plan: "Pure Vegetarian", size: "Custom B", custom: true, revenue: 20.15, tiffins: 2 },
  { plan: "Pure Vegetarian", size: "Idle", custom: false, revenue: 0, tiffins: 5 },
];
const veg = (a: string) => (a === "Pure Vegetarian" ? 0 : 1);
const order = (a: string, b: string) => veg(a) - veg(b);

describe("buildSizeTreemap", () => {
  it("folds custom sizes into one box per plan and keeps the total", () => {
    const g = buildSizeTreemap(rows, "revenue", order);
    expect(g.map((x) => x.name)).toEqual(["Pure Vegetarian", "Non-Veg"]);
    expect(g[0]!.children).toEqual([
      { name: "4 Item Thali", value: 200.2 },
      { name: "Custom sizes", value: 30.3 },
    ]);
    expect(treemapTotal(g)).toBeCloseTo(530.6, 2);
  });
  it("sizes by tiffins and drops zero boxes", () => {
    const g = buildSizeTreemap(rows, "tiffins", order);
    expect(treemapTotal(g)).toBe(48);
    expect(g[0]!.children.map((c) => c.name)).toEqual(["4 Item Thali", "Idle", "Custom sizes"]);
  });
});
