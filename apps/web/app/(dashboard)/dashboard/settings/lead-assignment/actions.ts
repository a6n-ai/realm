"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/guards";
import { setLeadAssignment } from "@/lib/services/app-settings.service";
import type { LeadAssignmentConfig } from "@/lib/services/assignment";

export async function saveLeadAssignment(cfg: LeadAssignmentConfig) {
  await requireAdmin();
  await setLeadAssignment(cfg);
  revalidatePath("/dashboard/settings/lead-assignment");
}
