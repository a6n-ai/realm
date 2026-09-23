import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guards", () => ({ requireAdmin: vi.fn(), requirePermission: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn().mockResolvedValue(new Headers()) }));
vi.mock("@/db/client", () => ({
  db: {
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async () => [{ email: "invitee@example.test", role: "member" }],
        }),
      }),
    }),
  },
}));
vi.mock("@/lib/auth", () => ({
  auth: {
    api: {
      createInvitation: vi.fn().mockResolvedValue({ id: "inv_new" }),
      cancelInvitation: vi.fn().mockResolvedValue({ id: "inv_1", status: "canceled" }),
    },
  },
}));

describe("resendInvite", () => {
  it("calls createInvitation with resend:true for the given user/org", async () => {
    const { auth } = await import("@/lib/auth");
    const { resendInvite } = await import("../actions");
    await resendInvite("user_pub_1", "org_1");
    expect(auth.api.createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ body: expect.objectContaining({ organizationId: "org_1", resend: true }) }),
    );
  });
});

describe("cancelInvitation", () => {
  it("calls auth.api.cancelInvitation with the invitation id", async () => {
    const { auth } = await import("@/lib/auth");
    const { cancelInvitation } = await import("../actions");
    await cancelInvitation("inv_1");
    expect(auth.api.cancelInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ body: { invitationId: "inv_1" } }),
    );
  });
});
