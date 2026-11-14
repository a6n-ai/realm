import { STAFF_ROLES } from "@/lib/roles";
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { users } from "@/db/schema";
import { getLeadAssignment, setLeadAssignment } from "./app-settings.service";
import { pickAssignee } from "./assignment";
import { poolFor } from "./owner-pool.service";

const staffWhere = and(eq(users.isSystem, false), eq(users.status, "active"), inArray(users.role, STAFF_ROLES));

export async function isActiveStaff(userId: bigint): Promise<boolean> {
  const [u] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, userId), staffWhere)).limit(1);
  return !!u;
}

const CURSOR_KEY = { order: "orders", ticket: "tickets" } as const;

/**
 * Owner for a new order/ticket that has no owner of its own. Staff acting owns it; anything else
 * (customer checkout, renewal job) comes from that entity's pool (Settings → Owner assignment) using its
 * strategy, then (orders only) the default inquiry pool, then all active staff. Returns null only when
 * there is no staff at all.
 */
export async function defaultOwner(actorUserId: bigint | null, entity: "order" | "ticket"): Promise<bigint | null> {
  if (actorUserId != null && (await isActiveStaff(actorUserId))) return actorUserId;
  let configured = await poolFor(entity);
  if (!configured.length && entity === "order") configured = await poolFor("inquiry");
  const pool = configured.length
    ? configured
    : await db.select({ id: users.id, publicId: users.publicId, weight: sql<number>`1` }).from(users).where(staffWhere);
  if (!pool.length) return null;
  const cfg = await getLeadAssignment();
  const cursorKey = CURSOR_KEY[entity];
  const strategy = (entity === "order" ? cfg.orders : cfg.tickets)?.strategy;
  const { chosen, cursorPublicId } = pickAssignee(strategy === "percentage" ? "percentage" : "round_robin", pool, cfg, cursorKey, Math.random());
  // ponytail: read-then-write cursor, two concurrent checkouts can pick the same owner; fine for a soft rotation.
  if (chosen && cursorPublicId && strategy !== "percentage") await setLeadAssignment({ ...cfg, cursor: { ...cfg.cursor, [cursorKey]: cursorPublicId } });
  return chosen?.id ?? null;
}
