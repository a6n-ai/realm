import { describe, expect, it, vi } from "vitest";

const inviteStaff = vi.hoisted(() => vi.fn(async (input: unknown) => ({ ...input as object, ok: true })));
vi.mock("@foundry/auth", () => ({
  createStaffInvite: vi.fn(() => ({ inviteStaff })),
}));
const hasPermission = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/auth", () => ({ auth: { api: { createUser: vi.fn(), createInvitation: vi.fn(), hasPermission } } }));
vi.mock("../users.service", () => ({ usersService: { markPasswordUnset: vi.fn() } }));

describe("inviteUser", () => {
  it("delegates straight through to the shared createStaffInvite helper", async () => {
    const { inviteUser } = await import("../users-invite");
    const input = { email: "ada@example.com", name: "Ada", role: "admin" as const, organizationId: "org_1" };
    const result = await inviteUser(input);

    expect(inviteStaff).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ...input, ok: true });
  });

  it("refuses before creating any account when the inviter can't invite to that org", async () => {
    const { inviteUser } = await import("../users-invite");
    inviteStaff.mockClear();
    hasPermission.mockRejectedValueOnce(new Error("USER_IS_NOT_A_MEMBER_OF_THE_ORGANIZATION"));
    await expect(
      inviteUser({ email: "ada@example.com", name: "Ada", role: "admin", organizationId: "org_franchise" }),
    ).rejects.toThrow(/can't invite staff/);
    expect(inviteStaff).not.toHaveBeenCalled();
  });
});
