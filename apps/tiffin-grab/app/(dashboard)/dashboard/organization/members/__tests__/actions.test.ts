import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn(), requirePermissionIn: vi.fn(), requireOwnerToGrant: vi.fn(), requireCanAssignRole: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: vi.fn().mockResolvedValue({ user: { id: "usr_me" }, session: { activeOrganizationId: "org_1" } }) }));
vi.mock("@/lib/auth/role-options", () => ({
  getRoleOptions: vi.fn().mockResolvedValue([{ value: "owner", label: "owner" }, { value: "admin", label: "admin" }, { value: "member", label: "member" }]),
}));
vi.mock("@/lib/identity/audit", () => ({ recordAudit: vi.fn() }));
vi.mock("@/lib/identity/user-ids", () => ({ userIdByPublicId: vi.fn().mockResolvedValue(1n) }));
vi.mock("@/lib/services/organizations.service", () => ({
  getMemberInOrg: vi.fn(),
  countOwners: vi.fn(),
  getMemberOrganizations: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/lib/catalog/load", () => ({ invalidateCatalogSnapshot: async () => undefined }));
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
      createInvitation: vi.fn().mockResolvedValue({ id: "inv_new", role: "member" }),
      signInMagicLink: vi.fn().mockResolvedValue({ status: true }),
      updateMemberRole: vi.fn().mockResolvedValue({ member: {} }),
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
    // The resend itself mails nothing (no sendInvitationEmail hook); the magic
    // link for the returned invitation is the email.
    expect(auth.api.signInMagicLink).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ callbackURL: "/accept-invitation/inv_new/complete" }),
      }),
    );
  });
});

describe("inviteUserAction", () => {
  it("refuses a role above the caller's own before creating the account", async () => {
    const guards = await import("@/lib/auth/guards");
    const { ForbiddenError } = await import("@foundry/commons");
    vi.mocked(guards.requireCanAssignRole).mockRejectedValueOnce(new ForbiddenError("too much"));
    const { inviteUserAction } = await import("../actions");
    expect(await inviteUserAction({ email: "a@example.test", name: "A", role: "admin" })).toEqual(expect.objectContaining({ error: "too much" }));
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
