// The Inquiries Renewals view's recommendations: which open plans staff should act on next, in one ranking.
import type { Visible } from "@/lib/tenant/org-scope";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { mealSizes, orders, plans, users } from "@/db/schema";
import { addDaysIso } from "@foundry/commons/util/dates";
import { UNASSIGNED_OWNER } from "@/lib/list/presets";
import { OPEN_TRACKS } from "@/lib/renewals/filters";
import { loadPlanFacts, ownerIdOf, visibleTo, type PlanFact } from "./renewal-facts";
import { hydrateRenewalRows, renewalSelect, type DayBounds, type RenewalRow } from "./renewals.service";

export type RenewalReason = "overdue" | "due" | "renew";
export type NextRenewalRow = RenewalRow & { reason: RenewalReason };
/** `owner`: the plan's current owner publicId, UNASSIGNED_OWNER, or null for every owner. */
export type RenewalQueueScope = { visible: Visible; owner: string | null };

const NO_REASON = 4;
const REASON_BY_RANK: Record<number, RenewalReason> = { 0: "overdue", 1: "due", 2: "renew", 3: "renew" };
const RUNNING_OR_DONE = new Set(["active", "paused", "completed"]);
const OPEN = new Set<string | null>(OPEN_TRACKS.map((t) => (t === "new" ? null : t)));

const isEmptyScope = (scope: RenewalQueueScope) => scope.visible !== "all" && scope.visible.length === 0;

/**
 * The one ranking: overdue follow-ups, then due today, then plans in the renew window (ending within 7 days,
 * then lapsed within 14, nothing booked after). Lower rank first, then the signal (oldest follow-up, or
 * soonest last tiffin), then order id. Plans with an upcoming follow-up are never in the queue.
 */
export function rankPlans(facts: readonly PlanFact[], today: string, day: DayBounds): { fact: PlanFact; rank: number }[] {
  const endingBy = addDaysIso(today, 7), lapsedFrom = addDaysIso(today, -14), yesterday = addDaysIso(today, -1);
  const ranked: { fact: PlanFact; rank: number; signal: number }[] = [];
  for (const p of facts) {
    if (!RUNNING_OR_DONE.has(p.status) || !OPEN.has(p.track)) continue;
    // The Open tracks exclude renewed / not renewed, so every plan here can show a follow-up.
    const at = p.trackFollowUpAt;
    if (at != null && at >= day.dayEnd) continue;
    const overdue = at != null && at < day.dayStart;
    const due = at != null && at >= day.dayStart && at < day.dayEnd;
    const last = p.last;
    const running = p.status === "active" || p.status === "paused";
    const window = p.renewal === "none" && last != null && ((running && last >= today && last <= endingBy) || (last >= lapsedFrom && last <= yesterday));
    const rank = overdue ? 0 : due ? 1 : window && last >= today ? 2 : window ? 3 : NO_REASON;
    if (rank === NO_REASON) continue;
    const signal = rank <= 1 ? at! : Date.parse(`${last}T00:00:00Z`);
    ranked.push({ fact: p, rank, signal });
  }
  ranked.sort((a, b) => a.rank - b.rank || a.signal - b.signal || (a.fact.id < b.fact.id ? -1 : a.fact.id > b.fact.id ? 1 : 0));
  return ranked;
}

/** The `limit` plans to act on first, and how many plans there are in all. */
export async function recommendedRenewals(
  scope: RenewalQueueScope,
  today: string,
  day: DayBounds,
  limit: number,
): Promise<{ rows: NextRenewalRow[]; total: number }> {
  if (isEmptyScope(scope)) return { rows: [], total: 0 };
  const [facts, ownerId] = await Promise.all([
    loadPlanFacts(),
    scope.owner && scope.owner !== UNASSIGNED_OWNER ? ownerIdOf(scope.owner) : Promise.resolve(null),
  ]);
  if (scope.owner && scope.owner !== UNASSIGNED_OWNER && ownerId == null) return { rows: [], total: 0 };
  const seen = visibleTo(scope.visible);
  const mine = facts.filter((p) => seen(p) && (!scope.owner || (scope.owner === UNASSIGNED_OWNER ? p.currentOwner == null : p.currentOwner === ownerId)));
  const ranked = rankPlans(mine, today, day);
  const picked = ranked.slice(0, limit);
  if (!picked.length) return { rows: [], total: 0 };
  const found = await db
    .select(renewalSelect)
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .leftJoin(users, eq(orders.userId, users.id))
    .where(inArray(orders.id, picked.map((p) => p.fact.id)));
  const byId = new Map(found.map((r) => [String(r.id), r]));
  const inOrder = picked.flatMap((p) => {
    const row = byId.get(String(p.fact.id));
    return row ? [{ row: { ...row, status: p.fact.renewal }, rank: p.rank }] : [];
  });
  const hydrated = await hydrateRenewalRows(inOrder.map((x) => x.row));
  return { rows: hydrated.map((row, i) => ({ ...row, reason: REASON_BY_RANK[inOrder[i].rank] })), total: ranked.length };
}
