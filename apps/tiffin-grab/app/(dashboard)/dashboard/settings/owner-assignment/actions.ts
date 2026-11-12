"use server";

import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { leadSources } from "@/db/schema";
import { staffAction } from "@/lib/actions/staff-action";
import type { ActionResult } from "@/lib/actions/action-result";
import { setMembership } from "@/lib/services/owner-pool.service";
import { getLeadAssignment, setLeadAssignment } from "@/lib/services/app-settings.service";
import type { OwnerEntity, Strategy } from "@/lib/services/assignment";

const OPTS = { guard: "admin", revalidate: ["/dashboard/settings/owner-assignment"] } as const;

// sourceKey only applies to inquiries; orders and tickets have one pool each.
export async function saveMembership(
  entity: OwnerEntity,
  sourceKey: string | null,
  members: { userId: string; weight: number }[],
): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    let sourceId: bigint | null = null;
    if (entity === "inquiry" && sourceKey) {
      const [s] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, sourceKey)).limit(1);
      sourceId = s?.id ?? null;
    }
    await setMembership(entity, sourceId, members.map((m) => ({ userId: BigInt(m.userId), weight: m.weight })));
  });
}

export async function saveStrategy(strategy: Strategy, perSource: Record<string, Strategy>): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    const cfg = await getLeadAssignment();
    await setLeadAssignment({ ...cfg, strategy, perSource });
  });
}

export async function saveEntityStrategy(entity: "order" | "ticket", strategy: Strategy): Promise<ActionResult> {
  return staffAction(OPTS, async () => {
    const cfg = await getLeadAssignment();
    await setLeadAssignment({ ...cfg, [entity === "order" ? "orders" : "tickets"]: { strategy } });
  });
}
