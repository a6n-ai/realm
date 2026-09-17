import { describe, expect, it } from "vitest";
import { Role } from "@foundry/commons";
import { franchiseCookieApplies } from "../franchise-cookie-scope";

describe("franchiseCookieApplies", () => {
  it("applies to guests", () => {
    expect(franchiseCookieApplies(null)).toBe(true);
  });

  it("applies to signed-in customers, who shop a franchise just like guests", () => {
    expect(franchiseCookieApplies({ user: { role: Role.USER } })).toBe(true);
  });

  it.each([Role.ADMIN, Role.MEMBER])("never applies to staff (%s)", (role) => {
    expect(franchiseCookieApplies({ user: { role } })).toBe(false);
  });
});
