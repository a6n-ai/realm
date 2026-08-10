"use server";

import type { RoleValue } from "@realm/commons";
import { ValidationError } from "@realm/commons";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { requireAdmin, requirePermission } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
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
  revalidatePath("/dashboard/users");
}

export async function setUserRole(userId: string, role: RoleValue) {
  await requireAdmin();
  await usersService.update(userId, { role });
  revalidatePath("/dashboard/users");
}

export async function adminUpdateContact(userId: string, input: { email?: string; phone?: string }) {
  await requireAdmin();
  await usersService.updateContact(userId, input);
  revalidatePath(`/dashboard/users/${userId}`);
  revalidatePath("/dashboard/users");
}

export async function setUserFlag(userId: string, flagId: string, enabled: boolean) {
  await requireAdmin();
  await userFeatureFlagsService.setFlag(userId, flagId, enabled);
  revalidatePath("/dashboard/users");
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

export async function inviteUserAction(input: { email: string; name: string; role: string }): Promise<void> {
  await requirePermission({ staff: ["invite"], user: ["create", "set-role"] });
  await inviteUser({ email: input.email, name: input.name, role: input.role as RoleValue });
  revalidatePath("/dashboard/users");
}
