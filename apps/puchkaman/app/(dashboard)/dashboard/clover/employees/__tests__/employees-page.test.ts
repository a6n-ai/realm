import { describe, expect, it, vi } from "vitest";

/**
 * Exercises the Clover employees page's real guard wiring: the actual
 * `requirePermission` from `@/lib/auth/guards` against the actual `roles`
 * map in `@/lib/auth/permissions` — only the session lookup is mocked.
 * Both the header (sync-button gating) and the table (listing) call sites
 * are read-only, so `member` gets `clover:read`. Syncing employees from
 * Clover is a separate mutation gated on `staff:invite` in the
 * `/api/employees/**` routes, which stays admin-only and is untouched here.
 */
const state = vi.hoisted(() => ({ role: "member" as string | null }));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () =>
    state.role ? { user: { id: "u1", role: state.role, email: "u1@test.com" } } : null,
}));

const { requirePermission } = await import("@/lib/auth/guards");

describe("Clover employees page permission wiring", () => {
  it("allows a member-role session to view the employees list (clover:read)", async () => {
    state.role = "member";
    await expect(requirePermission({ clover: ["read"] })).resolves.toBeUndefined();
  });

  it("allows an admin-role session to view the employees list", async () => {
    state.role = "admin";
    await expect(requirePermission({ clover: ["read"] })).resolves.toBeUndefined();
  });

  it("still denies a member-role session the Clover OAuth-connect permission", async () => {
    state.role = "member";
    await expect(requirePermission({ clover: ["connect"] })).rejects.toThrow();
  });

  it("denies a session with no role at all", async () => {
    state.role = null;
    await expect(requirePermission({ clover: ["read"] })).rejects.toThrow();
  });
});
