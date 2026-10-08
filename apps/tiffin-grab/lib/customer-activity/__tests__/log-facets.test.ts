import { describe, expect, it } from "vitest";
import {
  CUSTOMER_ACTIVITY_ACTIONS,
  CUSTOMER_ACTIVITY_CATEGORY_ACTIONS,
  CUSTOMER_ACTIVITY_FACETS,
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

  it("allows category and action filters to be combined and multi-selected", () => {
    const category = CUSTOMER_ACTIVITY_FACETS.find(
      (facet) => facet.kind !== "search" && facet.field === "category",
    );
    const action = CUSTOMER_ACTIVITY_FACETS.find(
      (facet) => facet.kind !== "search" && facet.field === "action",
    );
    expect(category?.kind).toBe("multi");
    expect(action?.kind).toBe("multi");
  });

  it("exposes customer vs admin actor filter and customer-name search", () => {
    const actor = CUSTOMER_ACTIVITY_FACETS.find(
      (facet) => facet.kind !== "search" && facet.field === "actorKind",
    );
    const search = CUSTOMER_ACTIVITY_FACETS.find((facet) => facet.kind === "search");
    expect(actor?.kind).toBe("pills");
    if (actor?.kind === "pills") {
      expect(actor.options.map((option) => option.value)).toEqual([
        "customer",
        "staff",
        "system",
      ]);
      expect(actor.options.map((option) => option.label)).toEqual([
        "Customer",
        "Admin",
        "System",
      ]);
    }
    expect(search?.kind).toBe("search");
    if (search?.kind === "search") {
      expect(search.fields).toContain("customerName");
    }
  });
});
