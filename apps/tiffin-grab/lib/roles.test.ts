import { describe, expect, it } from "vitest";
import { isCustomerRole } from "./roles";

describe("role predicates", () => {
  it("isCustomerRole is only the customer role", () => {
    expect(isCustomerRole("user")).toBe(true);
    expect(isCustomerRole("member")).toBe(false);
    expect(isCustomerRole(undefined)).toBe(false);
  });
});
