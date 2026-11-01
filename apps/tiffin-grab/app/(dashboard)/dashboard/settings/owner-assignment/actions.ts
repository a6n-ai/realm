"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leadSources } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { setMembership } from "@/lib/services/owner-pool.service";
import { getLeadAssignment, setLeadAssignment } from "@/lib/services/app-settings.service";
import type { OwnerEntity, Strategy } from "@/lib/services/assignment";

const PATH = "/dashboard/settings/owner-assignment";

// sourceKey only applies to inquiries; orders and tickets have one pool each.
export async function saveMembership(
  entity: OwnerEntity,
  sourceKey: string | null,
  members: { userId: string; weight: number }[],
) {
  await requireAdmin();
  let sourceId: bigint | null = null;
  if (entity === "inquiry" && sourceKey) {
    const [s] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, sourceKey)).limit(1);
    sourceId = s?.id ?? null;
  }
  await setMembership(entity, sourceId, members.map((m) => ({ userId: BigInt(m.userId), weight: m.weight })));
  revalidatePath(PATH);
}

export async function saveStrategy(strategy: Strategy, perSource: Record<string, Strategy>) {
  await requireAdmin();
  const cfg = await getLeadAssignment();
  await setLeadAssignment({ ...cfg, strategy, perSource });
  revalidatePath(PATH);
}

export async function saveEntityStrategy(entity: "order" | "ticket", strategy: Strategy) {
  await requireAdmin();
  const cfg = await getLeadAssignment();
  await setLeadAssignment({ ...cfg, [entity === "order" ? "orders" : "tickets"]: { strategy } });
  revalidatePath(PATH);
}
