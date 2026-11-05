import { describe, expect, it } from "vitest";
import { customersListHref } from "../customers-drill";

describe("customersListHref", () => {
  it("preserves the page date window", () => {
    expect(customersListHref({ from: "10", to: "20" })).toBe("/dashboard/customers?from=10&to=20");
  });

  it("adds customerType for buyer segments", () => {
    expect(customersListHref({ from: "10", to: "20" }, { customerType: "none" })).toBe(
      "/dashboard/customers?from=10&to=20&customerType=none",
    );
    expect(customersListHref({ from: "10", to: "20" }, { customerType: "ordered" })).toContain("customerType=ordered");
    expect(customersListHref({ from: "10", to: "20" }, { customerType: "repeat" })).toContain("customerType=repeat");
  });

  it("lets a card override the date window (e.g. new this week)", () => {
    expect(customersListHref({ from: "10", to: "20" }, { from: "1", to: "7" })).toBe(
      "/dashboard/customers?from=1&to=7",
    );
  });

  it("omits empty query", () => {
    expect(customersListHref({})).toBe("/dashboard/customers");
  });
});
