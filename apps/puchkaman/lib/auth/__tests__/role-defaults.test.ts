import { describe, expect, it } from "vitest";
import { Role } from "@foundry/commons";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { roleOrCustomer } from "@/lib/auth/session";

/**
 * `member` carries order:write and finance:read. Any path that creates a user
 * without naming a role — OTP sign-in, a future social provider, a hand-written
 * INSERT — must land on the powerless role, not a staff one.
 */
describe("role defaults fail closed", () => {
  it("defaults the users.role column to the customer role", () => {
    expect(users.role.default).toBe(Role.USER);
  });

  it("does not default the column to a staff role", () => {
    expect(users.role.default).not.toBe(Role.MEMBER);
    expect(users.role.default).not.toBe(Role.ADMIN);
  });

  it("defaults the better-auth additional field to the customer role", () => {
    const roleField = auth.options.user?.additionalFields?.role as
      | { defaultValue?: unknown }
      | undefined;
    expect(roleField?.defaultValue).toBe(Role.USER);
    expect(roleField?.defaultValue).not.toBe(Role.MEMBER);
  });

  it("falls back to the customer role when a session carries no role", () => {
    expect(roleOrCustomer(undefined)).toBe(Role.USER);
    expect(roleOrCustomer(Role.MEMBER)).not.toBe(Role.USER);
  });

  it("passes a real role through untouched", () => {
    expect(roleOrCustomer(Role.ADMIN)).toBe(Role.ADMIN);
  });
});
