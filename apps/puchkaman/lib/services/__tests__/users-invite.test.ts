import { describe, expect, it, vi } from "vitest";

const inviteStaff = vi.hoisted(() => vi.fn(async (input: unknown) => ({ ...input as object, ok: true })));
vi.mock("@foundry/auth", () => ({
  createStaffInvite: vi.fn(() => ({ inviteStaff })),
}));
vi.mock("@/lib/auth", () => ({ auth: { api: { createUser: vi.fn(), createInvitation: vi.fn() } } }));
vi.mock("../users.service", () => ({ usersService: { markPasswordUnset: vi.fn() } }));

describe("inviteUser", () => {
  it("delegates straight through to the shared createStaffInvite helper", async () => {
    const { inviteUser } = await import("../users-invite");
    const input = { email: "ada@example.com", name: "Ada", role: "admin" as const, organizationId: "org_1" };
    const result = await inviteUser(input);

    expect(inviteStaff).toHaveBeenCalledWith(input);
    expect(result).toEqual({ ...input, ok: true });
  });
});
