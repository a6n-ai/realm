"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leadSources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { setMembership } from "@/lib/services/inquiry-user-config.service";
import { getLeadAssignment, setLeadAssignment } from "@/lib/services/app-settings.service";
import type { Strategy } from "@/lib/services/assignment";

export async function saveMembership(sourceKey: string | null, members: { userId: string; weight: number }[]) {
  await requireAdmin();
  let sourceId: bigint | null = null;
  if (sourceKey) {
    const [s] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, sourceKey)).limit(1);
    sourceId = s?.id ?? null;
  }
  await setMembership(sourceId, members.map((m) => ({ userId: BigInt(m.userId), weight: m.weight })));
  revalidatePath("/dashboard/settings/lead-assignment");
}

export async function saveStrategy(strategy: Strategy, perSource: Record<string, Strategy>) {
  await requireAdmin();
  const cfg = await getLeadAssignment();
  await setLeadAssignment({ ...cfg, strategy, perSource });
  revalidatePath("/dashboard/settings/lead-assignment");
}
