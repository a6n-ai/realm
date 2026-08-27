import { describe, expect, it, vi } from "vitest";

/**
 * Exercises the logs page's real guard wiring end to end: the actual
 * `requirePermission` from `@/lib/auth/guards` against the actual `roles`
 * map in `@/lib/auth/permissions` — only the session lookup is mocked, so a
 * regression in either the role grant or the guard call is caught here.
 */
const state = vi.hoisted(() => ({ role: "member" as string | null }));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () =>
    state.role ? { user: { id: "u1", role: state.role, email: "u1@test.com" } } : null,
}));

const { requirePermission } = await import("@/lib/auth/guards");

describe("logs page permission wiring", () => {
  it("allows a member-role session now that audit:read is granted", async () => {
    state.role = "member";
    await expect(requirePermission({ audit: ["read"] })).resolves.toBeUndefined();
  });

  it("allows an admin-role session", async () => {
    state.role = "admin";
    await expect(requirePermission({ audit: ["read"] })).resolves.toBeUndefined();
  });

  it("still denies a member-role session lacking a non-granted permission", async () => {
    state.role = "member";
    await expect(requirePermission({ staff: ["invite"] })).rejects.toThrow();
  });
});
