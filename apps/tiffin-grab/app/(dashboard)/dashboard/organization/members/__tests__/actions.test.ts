import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/guards", () => ({ requirePermission: vi.fn(), requirePermissionIn: vi.fn(), requireOwnerToGrant: vi.fn() }));
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
      createInvitation: vi.fn().mockResolvedValue({ id: "inv_new" }),
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

describe("setMemberRole", () => {
  it("refuses your own member row", async () => {
    const svc = await import("@/lib/services/organizations.service");
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_me", userId: 1n, role: "admin" });
    const { auth } = await import("@/lib/auth");
    const { setMemberRole } = await import("../actions");
    expect(await setMemberRole("mem_me", "member")).toEqual(expect.objectContaining({ error: "You can't change your own role" }));
    expect(auth.api.updateMemberRole).not.toHaveBeenCalled();
  });

  it("refuses to demote the last owner", async () => {
    const svc = await import("@/lib/services/organizations.service");
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_2", userId: 2n, role: "owner" });
    vi.mocked(svc.countOwners).mockResolvedValue(1);
    const { auth } = await import("@/lib/auth");
    const { setMemberRole } = await import("../actions");
    expect(await setMemberRole("mem_2", "admin")).toEqual(expect.objectContaining({ error: "An organization needs at least one owner" }));
    expect(auth.api.updateMemberRole).not.toHaveBeenCalled();
  });

  it("changes the role through Better Auth in the active org and audits it", async () => {
    const svc = await import("@/lib/services/organizations.service");
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_3", userId: 3n, role: "member" });
    const { auth } = await import("@/lib/auth");
    const { recordAudit } = await import("@/lib/identity/audit");
    const { setMemberRole } = await import("../actions");
    expect(await setMemberRole("mem_3", "admin")).toEqual({ ok: true });
    expect(auth.api.updateMemberRole).toHaveBeenCalledWith(
      expect.objectContaining({ body: { memberId: "mem_3", role: "admin", organizationId: "org_1" } }),
    );
    expect(recordAudit).toHaveBeenCalledWith(expect.objectContaining({ entity: "member", entityPublicId: "mem_3" }));
  });

  it("returns a Better Auth refusal as action error text", async () => {
    const { APIError } = await import("better-auth/api");
    const svc = await import("@/lib/services/organizations.service");
    vi.mocked(svc.getMemberInOrg).mockResolvedValue({ id: "mem_4", userId: 4n, role: "member" });
    const { auth } = await import("@/lib/auth");
    vi.mocked(auth.api.updateMemberRole).mockRejectedValueOnce(new APIError("FORBIDDEN", { message: "You are not allowed to update this member" }));
    const { setMemberRole } = await import("../actions");
    expect(await setMemberRole("mem_4", "admin")).toEqual(expect.objectContaining({ error: "You are not allowed to update this member" }));
  });
});
