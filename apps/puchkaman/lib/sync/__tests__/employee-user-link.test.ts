import { describe, expect, it, vi } from "vitest";
import { resolveEmployeeUser, type EmployeeUserDeps } from "../clover-employees-sync.service";

function deps(over: Partial<EmployeeUserDeps> = {}): EmployeeUserDeps {
  return {
    findUserByEmail: vi.fn(async () => null),
    createMemberUser: vi.fn(async () => 99n),
    ...over,
  };
}

describe("resolveEmployeeUser", () => {
  it("creates a member account for an employee with an email", async () => {
    const d = deps();
    const id = await resolveEmployeeUser({ email: "cook@shop.com", name: "Cook" }, d);
    expect(id).toBe(99n);
    expect(d.createMemberUser).toHaveBeenCalledWith("cook@shop.com", "Cook");
  });

  it("links to an existing account instead of creating a second one", async () => {
    const d = deps({ findUserByEmail: vi.fn(async () => ({ id: 7n })) });
    const id = await resolveEmployeeUser({ email: "cook@shop.com", name: "Cook" }, d);
    expect(id).toBe(7n);
    expect(d.createMemberUser).not.toHaveBeenCalled();
  });

  // Only proves createMemberUser is skipped on a match — it can't see a role
  // column from here. The real "an admin survives a re-sync" proof is the
  // integration test in employee-user-link.integration.test.ts, which reads
  // users.role back out of the database.
  it("does not attempt to create a second account when one already exists", async () => {
    const d = deps({ findUserByEmail: vi.fn(async () => ({ id: 7n })) });
    await resolveEmployeeUser({ email: "boss@shop.com", name: "Boss" }, d);
    expect(d.createMemberUser).not.toHaveBeenCalled();
  });

  it("returns null for an employee with no email — there is no key to match on", async () => {
    const d = deps();
    expect(await resolveEmployeeUser({ email: null, name: "Walk In" }, d)).toBeNull();
    expect(d.createMemberUser).not.toHaveBeenCalled();
    expect(d.findUserByEmail).not.toHaveBeenCalled();
  });

  it("treats a blank or whitespace email as no email", async () => {
    const d = deps();
    expect(await resolveEmployeeUser({ email: "   ", name: "Walk In" }, d)).toBeNull();
    expect(d.createMemberUser).not.toHaveBeenCalled();
  });

  it("normalises the email before matching, so casing cannot fork an account", async () => {
    const d = deps();
    await resolveEmployeeUser({ email: "  Cook@Shop.com ", name: "Cook" }, d);
    expect(d.findUserByEmail).toHaveBeenCalledWith("cook@shop.com");
  });
});
