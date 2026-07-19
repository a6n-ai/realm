import { describe, expect, it } from "vitest";
import { Role } from "@realm/commons";
import { isStaffRole, roleLanding } from "./landing";

describe("roleLanding", () => {
  it("sends staff to the ops dashboard", () => {
    expect(roleLanding(Role.ADMIN)).toBe("/dashboard");
    expect(roleLanding(Role.MEMBER)).toBe("/dashboard");
  });
  it("sends customers to their account home", () => {
    expect(roleLanding(Role.USER)).toBe("/me");
  });
});

describe("isStaffRole", () => {
  it("is true only for admin/member", () => {
    expect(isStaffRole(Role.ADMIN)).toBe(true);
    expect(isStaffRole(Role.MEMBER)).toBe(true);
    expect(isStaffRole(Role.USER)).toBe(false);
  });
});
