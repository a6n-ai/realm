import { describe, expect, it } from "vitest";
import { orderActivityType } from "@/db/schema/orders";
import {
  ACTIVITY_TYPE_LABELS,
  ACTIVITY_TYPE_VALUES,
  LOG_ACTIVITY_CATEGORY_TYPES,
  withoutPaymentActivity,
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

describe("withoutPaymentActivity", () => {
  const rows = [{ type: "payment_claimed" }, { type: "note" }, { type: "payment_refunded" }, { type: "skipped" }];

  it("keeps every row for a finance:read viewer", () => {
    expect(withoutPaymentActivity(rows, true)).toEqual(rows);
  });

  it("drops every payment row for a viewer without finance:read", () => {
    expect(withoutPaymentActivity(rows, false).map((r) => r.type)).toEqual(["note", "skipped"]);
  });
});
