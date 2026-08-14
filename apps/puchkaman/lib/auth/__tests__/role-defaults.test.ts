import { describe, expect, it } from "vitest";
import { Role } from "@realm/commons";
import { users } from "@/db/schema";

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
});
