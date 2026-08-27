import { describe, expect, it } from "vitest";
import { Role } from "@realm/commons";
import { roleCan } from "@/lib/auth/guards";

/**
 * The console surfaces member is meant to reach. If a future permission edit
 * silently drops one of these, a synced Clover employee loses the job they were
 * synced to do — with no error anywhere, just a 403 they cannot explain.
 */
describe("member reaches its intended surfaces", () => {
  it.each([
    ["orders list", { order: ["read"] }],
    ["order detail", { order: ["read"] }],
    ["order mutations", { order: ["write"] }],
    ["products list", { product: ["read"] }],
    ["product writes", { product: ["write"] }],
    ["finance", { finance: ["read"] }],
    ["audit logs", { audit: ["read"] }],
    ["clover employees list", { clover: ["read"] }],
  ])("member may open %s", (_label, permissions) => {
    expect(roleCan(Role.MEMBER, permissions as never)).toBe(true);
  });

  it.each([
    ["product sync", { product: ["sync"] }],
    ["clover connect (OAuth setup)", { clover: ["connect"] }],
    ["staff invites", { staff: ["invite"] }],
    ["user listing", { user: ["list"] }],
  ])("member may NOT reach %s", (_label, permissions) => {
    expect(roleCan(Role.MEMBER, permissions as never)).toBe(false);
  });

  it("admin reaches everything member does", () => {
    for (const p of [{ order: ["read"] }, { product: ["read"] }, { finance: ["read"] }]) {
      expect(roleCan(Role.ADMIN, p as never)).toBe(true);
    }
  });

  it("a customer reaches no console surface at all", () => {
    for (const p of [{ order: ["read"] }, { product: ["read"] }, { finance: ["read"] }]) {
      expect(roleCan(Role.USER, p as never)).toBe(false);
    }
  });
});
