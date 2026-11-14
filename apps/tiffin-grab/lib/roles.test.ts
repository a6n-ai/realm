import { describe, expect, it } from "vitest";
import { isAdmin, isCustomerRole } from "./roles";

describe("role predicates", () => {
  it("isAdmin accepts a role or a session and is false for anything else", () => {
    expect(isAdmin("admin")).toBe(true);
    expect(isAdmin({ user: { role: "admin" } })).toBe(true);
    expect(isAdmin("member")).toBe(false);
    expect(isAdmin({ user: null })).toBe(false);
    expect(isAdmin(null)).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
  it("isCustomerRole is only the customer role", () => {
    expect(isCustomerRole("user")).toBe(true);
    expect(isCustomerRole("member")).toBe(false);
    expect(isCustomerRole(undefined)).toBe(false);
  });
});
