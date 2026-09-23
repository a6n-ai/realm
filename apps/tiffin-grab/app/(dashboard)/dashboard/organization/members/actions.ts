"use server";

import type { RoleValue } from "@foundry/commons";
import { ValidationError } from "@foundry/commons";
import { eq } from "drizzle-orm";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { getMemberOrganizations } from "@/lib/services/organizations.service";
import { userFeatureFlagsService } from "@/lib/services/user-feature-flags.service";
import { usersService } from "@/lib/services/users.service";
import { inviteUser } from "@/lib/services/users-invite";

export type UserStatusValue = "active" | "inactive" | "suspended" | "deleted";

export async function setUserStatus(userId: string, status: UserStatusValue) {
  await requireAdmin();
  const session = await getSession();
  if ((session?.user as { publicId?: string })?.publicId === userId) {
    throw new ValidationError("Change your own account status from account settings.");
  }
  // setStatus, not update: a non-active status must take the user's sessions with it,
  // otherwise "suspended" only stops the next login and leaves the current one running.
  if (status === "deleted") await usersService.softDelete(userId);
  else await usersService.setStatus(userId, status);
  revalidatePath("/dashboard/organization/members");
}

export async function setUserRole(userId: string, role: RoleValue) {
  await requireAdmin();
  // setRole, not update: demoting your own row out of admin locks you out of this
  // page, and the guard lives in the service so every caller inherits it.
  await usersService.setRole(userId, role);
  revalidatePath("/dashboard/organization/members");
}

export async function adminUpdateContact(userId: string, input: { email?: string; phone?: string }) {
  await requireAdmin();
  await usersService.updateContact(userId, input);
  revalidatePath(`/dashboard/organization/members/${userId}`);
  revalidatePath("/dashboard/organization/members");
}

export async function setUserFlag(userId: string, flagId: string, enabled: boolean) {
  await requireAdmin();
  await userFeatureFlagsService.setFlag(userId, flagId, enabled);
  revalidatePath("/dashboard/organization/members");
}

// Admin-initiated password reset for a staff member: mails them the normal
// 6-digit OTP reset code. The admin never sees or issues a password — nothing
// is shared out-of-band, and the existing password stays valid until the user
// completes the reset (so a failed delivery can't lock them out).
export async function resetStaffPassword(userId: string): Promise<{ email: string }> {
  await requireAdmin();
  const email = await usersService.assertStaffEmail(userId);
  await auth.api.sendVerificationOTP({ body: { email, type: "forget-password" } });
  return { email };
}

// Real resend, unlike the old ResetPasswordButton fallback which just re-mailed
// an OTP: createInvitation issues a fresh invitation row (extends expiry / makes
// a first invite for accounts created before this plan that have none at all).
export async function resendInvite(userId: string, organizationId: string): Promise<{ email: string }> {
  await requireAdmin();
  const [u] = await db.select({ email: users.email, role: users.role }).from(users).where(eq(users.publicId, userId)).limit(1);
  if (!u?.email) throw new ValidationError("This user has no email address to send an invite to.");
  await auth.api.createInvitation({
    body: { email: u.email, role: u.role as "admin" | "member", organizationId, resend: true },
    headers: await headers(),
  });
  revalidatePath("/dashboard/organization/members");
  return { email: u.email };
}

export async function cancelInvitation(invitationId: string): Promise<void> {
  await requireAdmin();
  await auth.api.cancelInvitation({ body: { invitationId }, headers: await headers() });
  revalidatePath("/dashboard/organization/members");
}

export async function inviteUserAction(input: { email: string; name: string; role: string }): Promise<void> {
  await requirePermission({ staff: ["invite"], user: ["create", "set-role"] });
  // Nothing sets activeOrganizationId at sign-in (the switcher only fires with
  // 2+ orgs), so fall back to the inviter's first direct membership — the same
  // org OrgSwitcher shows as active when none is set, and a direct member row
  // is what createInvitation requires.
  const session = await getSession();
  const organizationId =
    session?.session.activeOrganizationId ?? (await getMemberOrganizations(session))[0]?.id;
  if (!organizationId) throw new ValidationError("You aren't a member of any organization.");
  await inviteUser({
    email: input.email,
    name: input.name,
    role: input.role as "admin" | "member",
    organizationId,
  });
  revalidatePath("/dashboard/organization/members");
}
