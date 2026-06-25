"use server";

import type { RoleValue } from "@tiffin/commons";
import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db/client";
import { users } from "@/db/schema";
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

export async function setLeadFlags(userPublicId: string, flags: { acceptsLeads?: boolean; inDefaultPool?: boolean }) {
  await requireAdmin();
  await db.update(users).set(flags).where(eq(users.publicId, userPublicId));
  revalidatePath("/dashboard/users");
}
