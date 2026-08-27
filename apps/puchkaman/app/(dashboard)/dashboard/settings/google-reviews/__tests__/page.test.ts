import { describe, expect, it, vi } from "vitest";

/**
 * Exercises the google-reviews page/action guard wiring end to end: the
 * actual `requirePermission` from `@/lib/auth/guards` against the actual
 * `roles` map in `@/lib/auth/permissions` — only the session lookup is
 * mocked, so a regression in either the role grant or the guard call is
 * caught here.
 */
const state = vi.hoisted(() => ({ role: "member" as string | null }));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () =>
    state.role ? { user: { id: "u1", role: state.role, email: "u1@test.com" } } : null,
}));

const { requirePermission } = await import("@/lib/auth/guards");

describe("google-reviews page/action permission wiring", () => {
  it("allows a member-role session to read settings (page gate)", async () => {
    state.role = "member";
    await expect(requirePermission({ settings: ["read"] })).resolves.toBeUndefined();
  });

  it("allows a member-role session to write settings (action gate)", async () => {
    state.role = "member";
    await expect(requirePermission({ settings: ["write"] })).resolves.toBeUndefined();
  });

  it("allows an admin-role session", async () => {
    state.role = "admin";
    await expect(requirePermission({ settings: ["read"] })).resolves.toBeUndefined();
    await expect(requirePermission({ settings: ["write"] })).resolves.toBeUndefined();
  });

  it("still denies a member-role session lacking a non-granted permission", async () => {
    state.role = "member";
    await expect(requirePermission({ staff: ["invite"] })).rejects.toThrow();
  });
});
