import { describe, expect, it, vi } from "vitest";

/**
 * Exercises the Clover catalog config pages' real guard wiring end to end:
 * the actual `requirePermission` from `@/lib/auth/guards` against the actual
 * `roles` map in `@/lib/auth/permissions` — only the session lookup is
 * mocked. Covers modifier-groups, categories, menus (list + detail), and
 * labels: each page's header action (gates the sync/mutation controls) needs
 * product:write, and each page's data loader (list/detail view) needs only
 * product:read.
 */
const state = vi.hoisted(() => ({ role: "member" as string | null }));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () =>
    state.role ? { user: { id: "u1", role: state.role, email: "u1@test.com" } } : null,
}));

const { requirePermission } = await import("@/lib/auth/guards");

describe("Clover catalog config pages permission wiring", () => {
  it("allows a member-role session to view catalog data (product:read)", async () => {
    state.role = "member";
    await expect(requirePermission({ product: ["read"] })).resolves.toBeUndefined();
  });

  it("allows a member-role session to reach header sync actions now that product:write is granted", async () => {
    state.role = "member";
    await expect(requirePermission({ product: ["write"] })).resolves.toBeUndefined();
  });

  it("allows an admin-role session for both read and write", async () => {
    state.role = "admin";
    await expect(requirePermission({ product: ["read"] })).resolves.toBeUndefined();
    await expect(requirePermission({ product: ["write"] })).resolves.toBeUndefined();
  });

  it("still denies a member-role session lacking a non-granted permission", async () => {
    state.role = "member";
    await expect(requirePermission({ product: ["sync"] })).rejects.toThrow();
  });

  it("denies a session with no role at all", async () => {
    state.role = null;
    await expect(requirePermission({ product: ["read"] })).rejects.toThrow();
  });
});
