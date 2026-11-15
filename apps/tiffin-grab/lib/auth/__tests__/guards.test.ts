import { describe, expect, it, vi } from "vitest";
import { AuthError, ForbiddenError } from "@foundry/commons";

vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn() }));

const { getSession } = await import("@/lib/auth/session");
const { assertStaffSession } = await import("../guards");
const mockGetSession = getSession as unknown as ReturnType<typeof vi.fn>;

describe("assertStaffSession", () => {
  it("throws AuthError when signed out", async () => {
    mockGetSession.mockResolvedValueOnce(null);
    await expect(assertStaffSession()).rejects.toBeInstanceOf(AuthError);
  });
  it("allows a member", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { role: "member" } });
    await expect(assertStaffSession()).resolves.toBeUndefined();
  });
  it("forbids a customer", async () => {
    mockGetSession.mockResolvedValueOnce({ user: { role: "user" } });
    await expect(assertStaffSession()).rejects.toBeInstanceOf(ForbiddenError);
  });
});
