import { describe, expect, it } from "vitest";
import { orderActivityType } from "@/db/schema/orders";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_VALUES,
  LOG_ACTIVITY_CATEGORY_TYPES,
} from "@/lib/order-activity/log-facets";

describe("settings log facets", () => {
  it("every order_activity_type falls in exactly one category", () => {
    const counts = new Map<string, number>();
    for (const types of Object.values(LOG_ACTIVITY_CATEGORY_TYPES)) {
      for (const t of types) counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const t of orderActivityType.enumValues) {
      expect(counts.get(t), `${t} should be in exactly one category`).toBe(1);
    }
  });

  it("lists every enum value for the Action filter", () => {
    expect([...ACTIVITY_TYPE_VALUES].sort()).toEqual([...orderActivityType.enumValues].sort());
    for (const t of orderActivityType.enumValues) {
      expect(ACTIVITY_TYPE_LABELS[t]).toBeTruthy();
    }
  });
});
