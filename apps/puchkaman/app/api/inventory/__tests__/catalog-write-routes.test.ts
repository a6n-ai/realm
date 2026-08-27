import { describe, expect, it, vi } from "vitest";

/**
 * Exercises the real guard wiring for the Clover catalog write API routes
 * (sync/clover, categories/[id], modifier-groups/[id]) against the actual
 * `roles` map in `@/lib/auth/permissions` — only the session lookup is
 * mocked. These routes are the actual mutation entry points the catalog
 * config pages' buttons call; the page-level guards alone don't prove a
 * member can complete the action.
 */
const state = vi.hoisted(() => ({ role: "member" as string | null }));

vi.mock("@/lib/auth/session", () => ({
  getSession: async () =>
    state.role ? { user: { id: "u1", role: state.role, email: "u1@test.com" } } : null,
}));

const { requirePermission } = await import("@/lib/auth/guards");

describe("Clover catalog write route permission wiring", () => {
  it("allows a member-role session (product:write, as required by sync/categories/modifier-group routes)", async () => {
    state.role = "member";
    await expect(requirePermission({ product: ["write"] })).resolves.toBeUndefined();
  });

  it("allows an admin-role session", async () => {
    state.role = "admin";
    await expect(requirePermission({ product: ["write"] })).resolves.toBeUndefined();
  });

  it("denies a session with no role at all", async () => {
    state.role = null;
    await expect(requirePermission({ product: ["write"] })).rejects.toThrow();
  });
});
