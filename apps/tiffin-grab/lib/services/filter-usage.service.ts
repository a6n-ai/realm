import { isStaffRole } from "@/lib/roles";
import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { listFilterUsage, member } from "@/db/schema";
import type { FacetDef } from "@foundry/design-system";
import { getSession } from "@/lib/auth/session";
import { canonicalParams, presetFromCanonical, type FilterPreset } from "@/lib/list/presets";
import { userIdByPublicId } from "@/lib/identity/user-ids";

const MAX_CHIPS = 5;
// Fetch extra rows: some may no longer map onto the list (removed option) and get dropped.
const FETCH = MAX_CHIPS * 3;
const PATH = /^\/dashboard(\/[\w-]+)*$/;
const FIELD = /^[A-Za-z]{1,40}$/;

type Actor = { publicId: string; userId: bigint; organizationId: string | null };

/** Staff only: customers never record or see list filters. */
async function actor(): Promise<Actor | null> {
  const s = await getSession();
  if (!s || !isStaffRole(s.user.role)) return null;
  const userId = await userIdByPublicId(s.user.id);
  if (!userId) return null;
  let organizationId = s.session.activeOrganizationId;
  if (!organizationId) {
    const [m] = await db.select({ id: member.organizationId }).from(member).where(eq(member.userId, userId)).limit(1);
    organizationId = m?.id ?? null;
  }
  return { publicId: s.user.id, userId, organizationId };
}

/** No-op without filters. */
export async function recordFilterUse(path: string, query: string, fields: readonly string[]): Promise<void> {
  if (!PATH.test(path) || path.length > 120 || fields.length > 30 || !fields.every((f) => FIELD.test(f))) return;
  const a = await actor();
  if (!a) return;
  const params = canonicalParams(new URLSearchParams(query), fields, a.publicId);
  if (!params || params.length > 1000) return;
  const now = Date.now();
  await db
    .insert(listFilterUsage)
    .values({ userId: a.userId, organizationId: a.organizationId, path, params, uses: 1, lastUsedAt: now })
    .onConflictDoUpdate({
      target: [listFilterUsage.userId, listFilterUsage.path, listFilterUsage.params],
      set: { uses: sql`${listFilterUsage.uses} + 1`, lastUsedAt: now, organizationId: a.organizationId },
    });
}

/**
 * The viewer's own most-used filter combinations on this list. Only when they have none that still
 * fit the list, the combinations most staff in their organization use. Otherwise nothing.
 */
export async function filterRecommendations(path: string, spec: readonly FacetDef[]): Promise<FilterPreset[]> {
  if (!PATH.test(path)) return [];
  const a = await actor();
  if (!a) return [];
  const toPresets = (rows: { params: string }[]) =>
    rows
      .map((r) => presetFromCanonical(r.params, spec, a.publicId))
      .filter((p): p is FilterPreset => p != null)
      .slice(0, MAX_CHIPS);

  const own = await db
    .select({ params: listFilterUsage.params })
    .from(listFilterUsage)
    .where(and(eq(listFilterUsage.userId, a.userId), eq(listFilterUsage.path, path)))
    .orderBy(desc(listFilterUsage.uses), desc(listFilterUsage.lastUsedAt))
    .limit(FETCH);
  const mine = toPresets(own);
  if (mine.length || !a.organizationId) return mine;

  const people = sql<number>`count(distinct ${listFilterUsage.userId})`;
  const total = sql<number>`sum(${listFilterUsage.uses})`;
  const org = await db
    .select({ params: listFilterUsage.params })
    .from(listFilterUsage)
    .where(and(eq(listFilterUsage.organizationId, a.organizationId), eq(listFilterUsage.path, path)))
    .groupBy(listFilterUsage.params)
    .orderBy(desc(people), desc(total))
    .limit(FETCH);
  return toPresets(org);
}
