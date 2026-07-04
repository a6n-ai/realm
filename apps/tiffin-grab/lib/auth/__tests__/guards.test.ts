import { describe, expect, it, vi } from "vitest";
import { AuthError, ForbiddenError } from "@tiffin/commons";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

const { getSession } = await import("@/lib/auth/session");
const { requireStaff, requireRole, requireAdmin } = await import("../guards");
const mockGetSession = getSession as unknown as ReturnType<typeof vi.fn>;

describe("guards", () => {
  it("requireStaff throws AuthError when signed out", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    await expect(requireStaff()).rejects.toBeInstanceOf(AuthError);
  });
  it("requireStaff allows a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { role: "member" } });
    await expect(requireStaff()).resolves.toBeUndefined();
  });
  it("requireStaff forbids a customer", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { role: "user" } });
    await expect(requireStaff()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("requireAdmin forbids a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { role: "member" } });
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("requireRole enforces an explicit set", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { role: "member" } });
    await expect(requireRole("admin")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
