"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { usersService, type UserStatusValue } from "@/lib/services/users.service";

export async function setUserStatus(publicId: string, status: UserStatusValue): Promise<void> {
  await requireAdmin();
  // The self-suspension guard lives in the service, not here, so it holds for
  // every caller rather than just this button.
  await usersService.setStatus(publicId, status);
  revalidatePath("/dashboard/settings/users");
}
