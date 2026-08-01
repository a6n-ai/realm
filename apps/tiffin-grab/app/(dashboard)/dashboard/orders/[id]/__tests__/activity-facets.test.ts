import { describe, expect, it } from "vitest";
import { orderActivityType } from "@/db/schema/orders";
import {
  ACTIVITY_CATEGORY_TYPES,
  ACTIVITY_SCOPES,
  activityFacetsFor,
  activityTypesInScope,
  filterActivityRows,
} from "../activity-facets";

const row = (type: string, over: Partial<{ createdAt: number; actorKind: "system" | "staff" | "customer" }> = {}) => ({
  type,
  createdAt: 1_000,
  actorKind: "staff" as const,
  ...over,
});

describe("category coverage", () => {
  it("every order_activity_type falls in exactly one category", () => {
    const counts = new Map<string, number>();
    for (const types of Object.values(ACTIVITY_CATEGORY_TYPES)) {
      for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    // A type in no category is invisible in the UI; a type in two is double-counted.
    for (const t of orderActivityType.enumValues) {
      expect(counts.get(t), `${t} should be in exactly one category`).toBe(1);
    }
  });

  it("every category belongs to exactly one scope", () => {
    const scoped = Object.values(ACTIVITY_SCOPES).flat();
    expect([...scoped].sort()).toEqual(Object.keys(ACTIVITY_CATEGORY_TYPES).sort());
  });
});

describe("scoping", () => {
  it("splits meal and delivery events from lifecycle and payment events", () => {
    expect(activityTypesInScope("subscription")).toContain("meal_pick");
    expect(activityTypesInScope("subscription")).toContain("skipped");
    expect(activityTypesInScope("subscription")).not.toContain("payment_verified");
    expect(activityTypesInScope("commercial")).toContain("payment_verified");
    expect(activityTypesInScope("commercial")).not.toContain("meal_pick");
  });

  it("drops out-of-scope rows", () => {
    const rows = [row("meal_pick"), row("payment_verified"), row("skipped")];
    expect(filterActivityRows(rows, new URLSearchParams(), "subscription").map((r) => r.type)).toEqual([
      "meal_pick",
      "skipped",
    ]);
  });

  it("a category from the other scope yields nothing rather than leaking rows", () => {
    const rows = [row("meal_pick"), row("payment_verified")];
    const params = new URLSearchParams("category=payments");
    expect(filterActivityRows(rows, params, "subscription")).toEqual([]);
  });

  it("still filters by actor and time within a scope", () => {
    const rows = [
      row("meal_pick", { actorKind: "customer", createdAt: 100 }),
      row("meal_pick", { actorKind: "staff", createdAt: 900 }),
    ];
    expect(filterActivityRows(rows, new URLSearchParams("actorKind=staff"), "subscription")).toHaveLength(1);
    expect(filterActivityRows(rows, new URLSearchParams("from=500"), "subscription")).toHaveLength(1);
  });
});

describe("facets", () => {
  it("offers only the pills its scope can produce", () => {
    const opts = (scope: "subscription" | "commercial") =>
      (activityFacetsFor(scope)[0] as { options: { value: string }[] }).options.map((o) => o.value);
    expect(opts("subscription")).toEqual(["deliveries", "meals"]);
    expect(opts("commercial")).toEqual(["lifecycle", "payments", "notes"]);
  });
});
