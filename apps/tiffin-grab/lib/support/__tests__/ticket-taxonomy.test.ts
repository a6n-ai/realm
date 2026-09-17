import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABEL,
  SUBCATEGORIES,
  TICKET_CATEGORIES,
  categoryLabel,
  isTicketCategory,
  isValidPair,
  subcategoryLabel,
} from "@/lib/support/ticket-taxonomy";
import { ticketCategory } from "@/db/schema/tickets";

describe("ticket taxonomy shape", () => {
  it("every selectable category is a real ticket_category enum member", () => {
    // Guards the migration: a category added here without an ALTER TYPE would
    // typecheck fine and then fail at INSERT time in production.
    const enumValues = new Set<string>(ticketCategory.enumValues);
    for (const c of TICKET_CATEGORIES) expect(enumValues.has(c)).toBe(true);
  });

  it("every category has a label and at least one sub-category", () => {
    // Sub-category is required at submit, so a category with an empty list
    // would be a dead end the customer could select but never submit.
    for (const c of TICKET_CATEGORIES) {
      expect(CATEGORY_LABEL[c]).toBeTruthy();
      expect(SUBCATEGORIES[c].length).toBeGreaterThan(0);
    }
  });

  it("sub-category values are unique within their category", () => {
    for (const c of TICKET_CATEGORIES) {
      const values = SUBCATEGORIES[c].map((s) => s.value);
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it("does not offer the retired catering category", () => {
    expect(isTicketCategory("catering")).toBe(false);
    expect(ticketCategory.enumValues).toContain("catering");
  });
});

describe("isValidPair", () => {
  it("accepts a sub-category from its own category", () => {
    expect(isValidPair("delivery", "late_delivery")).toBe(true);
    expect(isValidPair("general", "something_else")).toBe(true);
  });

  it("rejects a real sub-category borrowed from another category", () => {
    // The trust-boundary case: both halves exist, the pair does not. A stale or
    // hand-crafted client posting this would otherwise poison two-level analytics.
    expect(isValidPair("packaging", "refund")).toBe(false);
    expect(isValidPair("billing", "food_quality")).toBe(false);
  });

  it("rejects unknown and retired categories", () => {
    expect(isValidPair("catering", "something_else")).toBe(false);
    expect(isValidPair("nonsense", "something_else")).toBe(false);
  });

  it("rejects an empty sub-category", () => {
    expect(isValidPair("delivery", "")).toBe(false);
  });
});

describe("labels", () => {
  it("labels current categories", () => {
    expect(categoryLabel("food_meal")).toBe("Food & Meal");
    expect(categoryLabel("billing")).toBe("Billing & Payment");
    expect(categoryLabel("general")).toBe("Other");
  });

  it("still labels retired categories on historical rows", () => {
    expect(categoryLabel("catering")).toBe("Catering");
  });

  it("falls back to the raw value for anything unrecognised", () => {
    expect(categoryLabel("from_the_future")).toBe("from_the_future");
  });

  it("returns null sub-category for rows predating the two-level picker", () => {
    expect(subcategoryLabel("order", null)).toBeNull();
  });

  it("labels a sub-category within its category", () => {
    expect(subcategoryLabel("delivery", "not_delivered")).toBe("Tiffin not delivered");
  });
});
