import { describe, expect, it } from "vitest";
import { roleOrCustomer } from "../session";
import { Role } from "@foundry/commons";

describe("roleOrCustomer", () => {
  it("keeps an explicit role", () => {
    expect(roleOrCustomer(Role.ADMIN)).toBe(Role.ADMIN);
    expect(roleOrCustomer(Role.MEMBER)).toBe(Role.MEMBER);
    expect(roleOrCustomer(Role.USER)).toBe(Role.USER);
  });

  it("fails closed onto the customer role when missing", () => {
    expect(roleOrCustomer(undefined)).toBe(Role.USER);
  });
});
