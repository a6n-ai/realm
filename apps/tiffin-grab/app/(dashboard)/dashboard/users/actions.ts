"use server";

import type { RoleValue } from "@tiffin/commons";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { userFeatureFlagsService } from "@/lib/services/user-feature-flags.service";
import { usersService } from "@/lib/services/users.service";

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
