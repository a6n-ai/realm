import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getLeadAssignment, setLeadAssignment } from "./app-settings.service";
import { pickAssignee } from "./assignment";
import { poolForSource } from "./inquiry-user-config.service";

const staffWhere = and(eq(users.isSystem, false), eq(users.status, "active"), inArray(users.role, ["admin", "member"]));

export async function isActiveStaff(userId: bigint): Promise<boolean> {
  const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), staffWhere)).limit(1);
  return !!u;
}

/**
 * Owner for a new record that has no owner of its own. Staff acting owns it; anything else
 * (customer checkout, renewal job) rotates through the default lead pool (Settings → lead
 * assignment), then all active staff. Returns null only when there is no staff at all.
 * `cursorKey` keeps each record type's rotation separate from the inquiry sources.
 */
export async function defaultOwner(actorUserId: bigint | null, cursorKey: string): Promise<bigint | null> {
  if (actorUserId != null && (await isActiveStaff(actorUserId))) return actorUserId;
  const configured = await poolForSource(null);
  const pool = configured.length
    ? configured
    : await db.select({ id: users.id, publicId: users.publicId, weight: sql<number>`1` }).from(users).where(staffWhere);
  if (!pool.length) return null;
  const cfg = await getLeadAssignment();
  // ponytail: read-then-write cursor, two concurrent checkouts can pick the same owner; fine for a soft rotation.
  const { chosen, cursorPublicId } = pickAssignee("round_robin", pool, cfg, cursorKey, 0);
  if (chosen && cursorPublicId) await setLeadAssignment({ ...cfg, cursor: { ...cfg.cursor, [cursorKey]: cursorPublicId } });
  return chosen?.id ?? null;
}
