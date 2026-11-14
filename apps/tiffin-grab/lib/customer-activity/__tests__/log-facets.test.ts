import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ACTIVITY_ACTIONS,
  CUSTOMER_ACTIVITY_CATEGORY_ACTIONS,
  categoryForCustomerAction,
} from "@/lib/customer-activity/log-facets";

describe("customer activity log facets", () => {
  it("puts every action in exactly one category", () => {
    const categorized = Object.values(CUSTOMER_ACTIVITY_CATEGORY_ACTIONS).flat();
    expect(categorized).toHaveLength(new Set(categorized).size);
    expect([...categorized].sort()).toEqual([...CUSTOMER_ACTIVITY_ACTIONS].sort());
    for (const action of CUSTOMER_ACTIVITY_ACTIONS) {
      expect(categoryForCustomerAction(action)).toBeTruthy();
    }
  });
});
