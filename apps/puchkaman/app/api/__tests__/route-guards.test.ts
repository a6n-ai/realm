import { describe, expect, it } from "vitest";
import { Role } from "@realm/commons";
import { roleCan } from "@/lib/auth/guards";

/**
 * Page guards do not protect a direct fetch. These pin the permission each
 * route family must demand, so a member can drive the screens they were given
 * and nothing more.
 */
describe("order and product route permissions", () => {
  it("member may read and write orders", () => {
    expect(roleCan(Role.MEMBER, { order: ["read"] } as never)).toBe(true);
    expect(roleCan(Role.MEMBER, { order: ["write"] } as never)).toBe(true);
  });

  it("member may read and write products (Clover catalog config), but never sync", () => {
    expect(roleCan(Role.MEMBER, { product: ["read"] } as never)).toBe(true);
    expect(roleCan(Role.MEMBER, { product: ["write"] } as never)).toBe(true);
    expect(roleCan(Role.MEMBER, { product: ["sync"] } as never)).toBe(false);
  });

  it("a customer may not touch any of them", () => {
    for (const p of [{ order: ["read"] }, { order: ["write"] }, { product: ["read"] }]) {
      expect(roleCan(Role.USER, p as never)).toBe(false);
    }
  });
});
