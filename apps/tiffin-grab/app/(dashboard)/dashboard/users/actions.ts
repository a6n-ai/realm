"use server";

import type { RoleValue } from "@realm/commons";
import { ValidationError } from "@realm/commons";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { getSession } from "@/lib/auth/session";
import { userFeatureFlagsService } from "@/lib/services/user-feature-flags.service";
import { usersService } from "@/lib/services/users.service";

export type UserStatusValue = "active" | "inactive" | "suspended" | "deleted";

export async function setUserStatus(userId: string, status: UserStatusValue) {
  await requireAdmin();
  const session = await getSession();
  if ((session?.user as { publicId?: string })?.publicId === userId) {
    throw new ValidationError("Change your own account status from account settings.");
  }
  if (status === "deleted") await usersService.softDelete(userId);
  else await usersService.update(userId, { status });
  revalidatePath("/dashboard/users");
}

export async function setUserRole(userId: string, role: RoleValue) {
  await requireAdmin();
  await usersService.update(userId, { role });
  revalidatePath("/dashboard/users");
}

export async function setUserFlag(userId: string, flagId: string, enabled: boolean) {
  await requireAdmin();
  await userFeatureFlagsService.setFlag(userId, flagId, enabled);
  revalidatePath("/dashboard/users");
}

// Reset a staff member to the shared default password; they are forced to set
// their own on next login. Returns the temp password for the admin to share
// out-of-band (no email/SMS wired yet).
export async function resetStaffPassword(userId: string): Promise<{ tempPassword: string }> {
  await requireAdmin();
  const { tempPassword } = await usersService.resetToDefaultPassword(userId);
  revalidatePath("/dashboard/users");
  return { tempPassword };
}
