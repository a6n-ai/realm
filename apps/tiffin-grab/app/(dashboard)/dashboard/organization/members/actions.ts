"use server";

import { isCustomerRole } from "@/lib/roles";
import { StaffInviteError } from "@foundry/auth";
import { ForbiddenError, ValidationError } from "@foundry/commons";
import { and, eq } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/db/client";
import { member, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import type { ActionResult } from "@/lib/actions/action-result";
import { staffAction, type StaffActionOpts } from "@/lib/actions/staff-action";
import { sendStaffInviteLink, sendStaffSetupLink } from "@/lib/auth/invite-links";
import { requireOwnerToGrant, requirePermission, requirePermissionIn } from "@/lib/auth/guards";
import { authApi } from "@/lib/auth/org-role-api";
import { getRoleOptions } from "@/lib/auth/role-options";
import { getSession } from "@/lib/auth/session";
import { recordAudit } from "@/lib/identity/audit";
import { userIdByPublicId } from "@/lib/identity/user-ids";
import { countOwners, getMemberInOrg, getMemberOrganizations } from "@/lib/services/organizations.service";
import { ContactTakenError, usersService } from "@/lib/services/users.service";
import { inviteUser } from "@/lib/services/users-invite";

export type UserStatusValue = "active" | "inactive" | "suspended" | "deleted";

const MEMBERS = "/dashboard/organization/members";
const MEMBER_UPDATE = { guard: { member: ["update"] }, revalidate: [MEMBERS] } as const;
const INVITATION_CREATE = { guard: { invitation: ["create"] }, revalidate: [MEMBERS] } as const;
const INVITATION_CANCEL = { guard: { invitation: ["cancel"] }, revalidate: [MEMBERS] } as const;

/**
 * users.* writes are global, so the permission follows the target: a member of the caller's active
 * org needs member:update there, a customer needs customer:manage, anyone else is out of reach.
 * super_admin passes the guard (audited) for any target.
 */
async function authorizeTarget(userPublicId: string): Promise<void> {
  const session = await getSession();
  if (session?.user.platformRole === "super_admin") return requirePermission({ member: ["update"] });
  const [target] = await db
    .select({ id: users.id, role: users.role, platformRole: users.platformRole })
    .from(users)
    .where(eq(users.publicId, userPublicId))
    .limit(1);
  if (!target || target.platformRole === "super_admin") throw new ForbiddenError();
  // An email change is an account takeover, so the caller needs member:update (and owner, for an
  // owner row) in EVERY org the target belongs to, not only the active one.
  const rows = await db
    .select({ organizationId: member.organizationId, role: member.role })
    .from(member)
    .where(eq(member.userId, target.id));
  if (rows.length) {
    for (const r of rows) {
      await requirePermissionIn(r.organizationId, { member: ["update"] });
      await requireOwnerToGrant(r.organizationId, r.role);
    }
    // A customer account added to an org is still a customer: both checks apply.
    if (isCustomerRole(target.role)) await requirePermission({ customer: ["manage"] });
    return;
  }
  // Customers are global (the customers pages apply no org scope), so customer:manage is the whole check.
  if (isCustomerRole(target.role)) return requirePermission({ customer: ["manage"] });
  throw new ForbiddenError();
}

export async function setUserStatus(userId: string, status: UserStatusValue): Promise<ActionResult> {
  return staffAction({ revalidate: [MEMBERS] }, async () => {
    await authorizeTarget(userId);
    const session = await getSession();
    if ((session?.user as { publicId?: string })?.publicId === userId) {
      throw new ValidationError("Change your own account status from account settings.");
    }
    // setStatus, not update: a non-active status must take the user's sessions with it,
    // otherwise "suspended" only stops the next login and leaves the current one running.
    if (status === "deleted") await usersService.softDelete(userId);
    else await usersService.setStatus(userId, status);
  });
}

export async function setMemberRole(memberId: string, role: string): Promise<ActionResult> {
  return staffAction(MEMBER_UPDATE, async () => {
    const session = await getSession();
    const organizationId = session?.session.activeOrganizationId;
    if (!session || !organizationId) throw new ValidationError("Select an organization first.");
    const target = await getMemberInOrg(organizationId, memberId);
    if (!target) throw new ValidationError("Member not found in this organization.");
    if (target.userId === (await userIdByPublicId(session.user.id))) {
      throw new ValidationError("You can't change your own role");
    }
    if (!(await getRoleOptions(organizationId)).some((o) => o.value === role)) throw new ValidationError("Unknown role.");
    await requireOwnerToGrant(organizationId, role, target.role);
    const wasOwner = target.role.split(",").some((r) => r.trim() === "owner");
    if (wasOwner && role !== "owner" && (await countOwners(organizationId)) <= 1) {
      throw new ValidationError("An organization needs at least one owner");
    }
    await authApi(async () =>
      auth.api.updateMemberRole({ body: { memberId, role, organizationId }, headers: await headers() }),
    );
    await recordAudit({
      entity: "member",
      entityPublicId: memberId,
      operation: "update",
      changes: { role: { from: target.role, to: role }, organizationId },
      createdBy: await userIdByPublicId(session.user.id),
    });
  });
}

/**
 * A phone or email held by another account is not an error to retry: it comes back as `taken`
 * with a link to the holder, so the form can offer to open that account.
 */
export async function adminUpdateContact(
  userId: string,
  input: { email?: string; phone?: string },
  opts: { removePhone?: boolean } = {},
): Promise<ActionResult<{ taken?: { message: string; holderHref: string } }>> {
  const targets = [
    `${MEMBERS}/${userId}`,
    [`/dashboard/customers/${userId}`, "layout"] as const,
    MEMBERS,
  ];
  return staffAction({ revalidate: targets }, async (): Promise<{ taken?: { message: string; holderHref: string } }> => {
    await authorizeTarget(userId);
    try {
      await usersService.updateContact(userId, opts.removePhone ? { phone: "" } : input, { nameClash: true, ...opts });
    } catch (e) {
      if (e instanceof ContactTakenError) {
        const { publicId, role } = e.holder;
        const base = isCustomerRole(role) ? "/dashboard/customers" : MEMBERS;
        return { taken: { message: e.message, holderHref: `${base}/${publicId}` } };
      }
      throw e;
    }
    return {};
  });
}

// Members-row access mail. With a password: the normal 6-digit OTP reset code —
// the admin never sees or issues a password, and the old one stays valid until
// the reset completes. Without one: they already hold a member row, so
// createInvitation would throw USER_IS_ALREADY_A_MEMBER; re-send the invite mail
// with a sign-in link straight to /set-password instead. A "password reset" mail
// to someone who never had a password read as a mistake, which is why this is
// not one path.
export async function sendStaffAccessEmail(userId: string): Promise<ActionResult<{ email: string; kind: "invite" | "reset" }>> {
  return staffAction({}, async (): Promise<{ email: string; kind: "invite" | "reset" }> => {
    await authorizeTarget(userId);
    const email = await usersService.assertStaffEmail(userId);
    const [u] = await db
      .select({ role: users.role, passwordSet: users.passwordSet })
      .from(users)
      .where(eq(users.publicId, userId))
      .limit(1);
    if (!u?.passwordSet) {
      await sendStaffSetupLink({ email, role: u?.role ?? "member" });
      return { email, kind: "invite" };
    }
    await auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
    return { email, kind: "reset" };
  });
}

// Real resend, unlike the old ResetPasswordButton fallback which just re-mailed
// an OTP: createInvitation issues a fresh invitation row (extends expiry / makes
// a first invite for accounts created before this plan that have none at all).
export async function resendInvite(userId: string, organizationId: string): Promise<ActionResult<{ email: string }>> {
  return staffAction(INVITATION_CREATE, async () => {
    const [u] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.publicId, userId)).limit(1);
    if (!u?.email) throw new ValidationError("This user has no email address to send an invite to.");
    // The invite carries the org role, not users.role (always "member" for staff).
    const [m] = await db
      .select({ role: member.role })
      .from(member)
      .where(and(eq(member.organizationId, organizationId), eq(member.userId, u.id)))
      .limit(1);
    const role = m?.role ?? "member";
    const invitation = await authApi(async () =>
      auth.api.createInvitation({
        body: { email: u.email!, role: role as "member", organizationId, resend: true },
        headers: await headers(),
      }),
    );
    await sendStaffInviteLink({ email: u.email, role, invitationId: invitation.id });
    return { email: u.email };
  });
}

export async function cancelInvitation(invitationId: string): Promise<ActionResult> {
  return staffAction(INVITATION_CANCEL, async () => {
    await auth.api.cancelInvitation({ body: { invitationId }, headers: await headers() });
  });
}

// The invitation permission is the org-level gate. `user:*` is a platform-admin permission no org role
// holds; createUser then runs from this trusted action without headers, which skips its caller check.
const INVITE: StaffActionOpts = INVITATION_CREATE;

export async function inviteUserAction(input: { email: string; name: string; role: string }): Promise<ActionResult> {
  return staffAction(INVITE, async () => {
    // Nothing sets activeOrganizationId at sign-in (the switcher only fires with
    // 2+ orgs), so fall back to the inviter's first direct membership — the same
    // org OrgSwitcher shows as active when none is set, and a direct member row
    // is what createInvitation requires.
    const session = await getSession();
    const organizationId =
      session?.session.activeOrganizationId ?? (await getMemberOrganizations(session))[0]?.id;
    if (!organizationId) throw new ValidationError("You aren't a member of any organization.");
    if (!(await getRoleOptions(organizationId)).some((o) => o.value === input.role)) {
      throw new ValidationError("Unknown role.");
    }
    await requireOwnerToGrant(organizationId, input.role);
    try {
      await inviteUser({ email: input.email, name: input.name, role: input.role, organizationId });
    } catch (e) {
      if (e instanceof StaffInviteError) throw new ValidationError(e.message);
      throw e;
    }
  });
}
