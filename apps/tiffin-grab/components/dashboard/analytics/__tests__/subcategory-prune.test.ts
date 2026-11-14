import { describe, expect, it } from "vitest";
import { pruneSubcategories } from "../subcategory-prune";

const opts = [
  { value: "late", parent: "delivery" },
  { value: "cold", parent: "food" },
  { value: "stale", parent: "food" },
];

describe("pruneSubcategories", () => {
  it("drops sub-categories of another category when the category changes", () => {
    expect(pruneSubcategories(["cold", "late"], "delivery", opts)).toEqual(["late"]);
    expect(pruneSubcategories(["cold"], "delivery", opts)).toEqual([]);
  });
  it("keeps matching values and drops everything with no category", () => {
    expect(pruneSubcategories(["cold", "stale"], "food", opts)).toEqual(["cold", "stale"]);
    expect(pruneSubcategories(["cold"], undefined, opts)).toEqual([]);
  });
});
