import { describe, expect, it, vi } from "vitest";
import { AuthError, ForbiddenError } from "@tiffin/commons";

vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));

const { auth } = await import("@/lib/auth");
const { requireStaff, requireRole, requireAdmin } = await import("../guards");
const mockAuth = auth as unknown as ReturnType<typeof vi.fn>;

describe("guards", () => {
  it("requireStaff throws AuthError when signed out", async () => {
    mockAuth.mockResolvedValueOnce(null);
    await expect(requireStaff()).rejects.toBeInstanceOf(AuthError);
  });
  it("requireStaff allows a member", async () => {
    mockAuth.mockResolvedValueOnce({ user: { role: "member" } });
    await expect(requireStaff()).resolves.toBeUndefined();
  });
  it("requireStaff forbids a customer", async () => {
    mockAuth.mockResolvedValueOnce({ user: { role: "user" } });
    await expect(requireStaff()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("requireAdmin forbids a member", async () => {
    mockAuth.mockResolvedValueOnce({ user: { role: "member" } });
    await expect(requireAdmin()).rejects.toBeInstanceOf(ForbiddenError);
  });
  it("requireRole enforces an explicit set", async () => {
    mockAuth.mockResolvedValueOnce({ user: { role: "member" } });
    await expect(requireRole("admin")).rejects.toBeInstanceOf(ForbiddenError);
  });
});
