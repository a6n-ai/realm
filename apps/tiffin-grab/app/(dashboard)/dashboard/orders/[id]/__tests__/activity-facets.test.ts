import { describe, expect, it } from "vitest";
import { orderActivityType } from "@/db/schema/orders";
import {
  ACTIVITY_CATEGORY_TYPES,
  ORDER_ACTIVITY_FACETS,
  filterActivityRows,
} from "../activity-facets";

const row = (
  type: string,
  over: Partial<{ createdAt: number; actorKind: "system" | "staff" | "customer" }> = {},
) => ({ type, createdAt: 1_000, actorKind: "staff" as const, ...over });

describe("category coverage", () => {
  it("every order_activity_type falls in exactly one category", () => {
    const counts = new Map<string, number>();
    for (const types of Object.values(ACTIVITY_CATEGORY_TYPES)) {
      for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    // A type in no category is unreachable by the filter pills; a type in two is
    // double-counted. meal_pick sat in the first bucket for months with nothing writing it.
    for (const t of orderActivityType.enumValues) {
      expect(counts.get(t), `${t} should be in exactly one category`).toBe(1);
    }
  });

  it("offers a pill for every category", () => {
    const options = (ORDER_ACTIVITY_FACETS[0] as { options: { value: string }[] }).options;
    expect(options.map((o) => o.value)).toEqual(Object.keys(ACTIVITY_CATEGORY_TYPES));
  });
});

describe("filterActivityRows", () => {
  it("keeps everything when no filter is applied", () => {
    const rows = [row("meal_pick"), row("payment_verified"), row("created")];
    expect(filterActivityRows(rows, new URLSearchParams())).toHaveLength(3);
  });

  it("narrows to a category's types", () => {
    const rows = [row("meal_pick"), row("payment_verified"), row("payment_rejected")];
    const got = filterActivityRows(rows, new URLSearchParams("category=payments"));
    expect(got.map((r) => r.type)).toEqual(["payment_verified", "payment_rejected"]);
  });

  it("ignores an unknown category rather than emptying the table", () => {
    const rows = [row("meal_pick")];
    expect(filterActivityRows(rows, new URLSearchParams("category=nonsense"))).toHaveLength(1);
  });

  it("filters by actor and time", () => {
    const rows = [
      row("meal_pick", { actorKind: "customer", createdAt: 100 }),
      row("meal_pick", { actorKind: "staff", createdAt: 900 }),
    ];
    expect(filterActivityRows(rows, new URLSearchParams("actorKind=staff"))).toHaveLength(1);
    expect(filterActivityRows(rows, new URLSearchParams("from=500"))).toHaveLength(1);
    expect(filterActivityRows(rows, new URLSearchParams("to=500"))).toHaveLength(1);
  });
});
