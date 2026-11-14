// Leaf module: shared by inquiries.service and inquiry-links.service. It must not import
// lib/orders/create-order or ./inquiries.service — create-order calls into inquiry-links,
// and inquiries.service imports create-order, so either import would close a cycle.
import { BaseRepository, UpdatableRepository } from "@foundry/database";
import { ValidationError } from "@foundry/commons";
import { and, desc, eq, inArray, ne, notInArray, or, sql, type SQL } from "drizzle-orm";
import { db, type Tx } from "@/db/client";
import { inquiries, inquiryActivities, leadCounters, leadSources, leadSubsources, users } from "@/db/schema";
import { activeStaffPool, isActiveStaff } from "@/lib/staff/default-owner";
import { systemUserId as sysUserId } from "@/lib/identity/user-ids";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { findZone } from "@/lib/catalog/zone-match";
import { looksGeneratedName } from "@/lib/inquiries/quick-add";
import { enqueueNotification, enqueueStaffNotification } from "@/lib/notifications/enqueue";
import { SessionBaseService, SessionUpdatableService } from "@/lib/services/session-service";
import { getLeadAssignment, setLeadAssignment } from "@/lib/staff/lead-assignment-settings";
import { pickAssignee, strategyFor } from "@/lib/staff/assignment";
import { poolFor } from "@/lib/staff/owner-pool.service";

export type InquiryRow = typeof inquiries.$inferSelect;
type ActivityInsert = typeof inquiryActivities.$inferInsert;

export const inquiryRows = new SessionUpdatableService(new UpdatableRepository(db, inquiries, inquiries.publicId, inquiries.id));
export const inquiryActivitiesService = new SessionBaseService(
  new BaseRepository(db, inquiryActivities, inquiryActivities.publicId, inquiryActivities.id),
);

/** Every activity belongs to a round: unless the caller says otherwise, the inquiry's current order. */
export async function addActivity(values: ActivityInsert): Promise<typeof inquiryActivities.$inferSelect> {
  let orderId = values.orderId;
  if (orderId === undefined) {
    const [row] = await db.select({ currentOrderId: inquiries.currentOrderId }).from(inquiries).where(eq(inquiries.id, values.inquiryId)).limit(1);
    orderId = row?.currentOrderId ?? null;
  }
  return inquiryActivitiesService.create({ ...values, orderId });
}

function contactPredicate(phone: string | null, email?: string | null, whatsappPhone?: string | null): SQL | null {
  // A number matches either stored number: people often enquire from WhatsApp on a different phone.
  const numbers = [...new Set([phone, whatsappPhone].filter((n): n is string => !!n).map((n) => n.toLowerCase()))];
  const parts = [
    ...numbers.flatMap((n) => [eq(sql`lower(${inquiries.phone})`, n), eq(sql`lower(${inquiries.whatsappPhone})`, n)]),
    email ? eq(sql`lower(${inquiries.email})`, email.toLowerCase()) : undefined,
  ].filter((p): p is SQL => !!p);
  return parts.length ? or(...parts)! : null;
}

/**
 * One open inquiry per person: a phone OR email match on an open (not
 * converted/lost) inquiry is the same person. Email wins when phone and email
 * point at different inquiries — email is the login identity. Newest first.
 */
export async function findOpenMatch(
  phone: string | null,
  email?: string | null,
  excludeId?: bigint,
  whatsappPhone?: string | null,
): Promise<InquiryRow | null> {
  const match = contactPredicate(phone, email, whatsappPhone);
  if (!match) return null;
  const rows = await db
    .select()
    .from(inquiries)
    .where(and(match, notInArray(inquiries.stage, ["converted", "lost"]), excludeId != null ? ne(inquiries.id, excludeId) : undefined))
    .orderBy(desc(inquiries.createdAt));
  const byEmail = email ? rows.find((r) => r.email?.toLowerCase() === email.toLowerCase()) : undefined;
  return byEmail ?? rows[0] ?? null;
}

const STAGE_RANK: Record<InquiryRow["stage"], number> = { follow_up: 5, contacted: 4, quoted: 4, new: 3, converted: 2, lost: 1 };
export const stageRank = (stage: InquiryRow["stage"]): number => STAGE_RANK[stage];

const latestActivitySql = sql<number>`coalesce((select max(${inquiryActivities.createdAt}) from ${inquiryActivities} where ${inquiryActivities.inquiryId} = ${inquiries.id}), 0)`;

/** Any-stage match: the person's row (open first, then stage rank, then latest activity), plus a second row that matched another identifier. */
export async function findMatch(
  phone: string | null,
  email?: string | null,
  excludeId?: bigint,
  whatsappPhone?: string | null,
): Promise<{ match: InquiryRow | null; conflictWith: InquiryRow | null }> {
  const match = contactPredicate(phone, email, whatsappPhone);
  if (!match) return { match: null, conflictWith: null };
  const rows = await db
    .select({ row: inquiries, latest: latestActivitySql })
    .from(inquiries)
    .where(and(match, excludeId != null ? ne(inquiries.id, excludeId) : undefined));
  if (!rows.length) return { match: null, conflictWith: null };
  // Email is the login identity, so at equal stage it beats a phone match.
  const byEmail = (r: InquiryRow) => (email && r.email?.toLowerCase() === email.toLowerCase() ? 1 : 0);
  rows.sort(
    (a, b) =>
      stageRank(b.row.stage) - stageRank(a.row.stage) ||
      byEmail(b.row) - byEmail(a.row) ||
      Number(b.latest) - Number(a.latest) ||
      b.row.createdAt - a.row.createdAt,
  );
  const [first, ...rest] = rows.map((r) => r.row);
  return { match: first, conflictWith: rest[0] ?? null };
}

export const FILLABLE_FIELDS = [
  "fullName", "phone", "whatsappPhone", "email", "postalCode", "zoneId",
  "planInterest", "mealSizeInterest", "frequencyKeyInterest", "personsInterest", "eatingDaysInterest", "preferredStart",
] as const;
type Fillable = (typeof FILLABLE_FIELDS)[number];
const IDENTIFIERS = ["phone", "whatsappPhone", "email"] as const;
type Identifier = (typeof IDENTIFIERS)[number];

const isEmpty = (v: unknown) => v == null || (typeof v === "string" && !v.trim()) || (Array.isArray(v) && v.length === 0);

/** Values from a repeat contact that the row lacks. Identifiers another row already holds are skipped (they would break the unique indexes). */
export async function fillEmpty(row: InquiryRow, incoming: Partial<InquiryRow>): Promise<{ patch: Partial<InquiryRow>; skipped: Identifier[] }> {
  const patch: Partial<Record<Fillable, unknown>> = {};
  for (const f of FILLABLE_FIELDS) {
    const next = incoming[f];
    if (isEmpty(next)) continue;
    const current = row[f];
    const replaceable = f === "fullName" ? row.leadNumber != null && typeof current === "string" && looksGeneratedName(current) : isEmpty(current);
    if (replaceable) patch[f] = next;
  }
  const skipped: Identifier[] = [];
  for (const f of IDENTIFIERS) {
    const v = patch[f];
    if (typeof v !== "string") continue;
    const lower = v.toLowerCase();
    const held =
      f === "email"
        ? eq(sql`lower(${inquiries.email})`, lower)
        : or(eq(sql`lower(${inquiries.phone})`, lower), eq(sql`lower(${inquiries.whatsappPhone})`, lower));
    const [other] = await db.select({ id: inquiries.id }).from(inquiries).where(and(held, ne(inquiries.id, row.id))).limit(1);
    if (other) {
      delete patch[f];
      skipped.push(f);
    }
  }
  return { patch: patch as Partial<InquiryRow>, skipped };
}

export async function resolveSource(sourceKey: string, subSourceKey?: string) {
  const [src] = await db
    .select({ id: leadSources.id, isInbound: leadSources.isInbound })
    .from(leadSources)
    .where(eq(leadSources.key, sourceKey))
    .limit(1);
  if (!src) throw new ValidationError(`Unknown lead source: ${sourceKey}`);
  let subSourceId: bigint | null = null;
  if (subSourceKey) {
    // Sub-source keys are not unique across sources.
    const [sub] = await db
      .select({ id: leadSubsources.id })
      .from(leadSubsources)
      .where(and(eq(leadSubsources.sourceId, src.id), eq(leadSubsources.key, subSourceKey)))
      .limit(1);
    subSourceId = sub?.id ?? null;
  }
  return { sourceId: src.id, subSourceId, isInbound: src.isInbound };
}

async function systemUserId(): Promise<bigint> {
  const id = await sysUserId();
  if (!id) throw new Error("system user not seeded");
  return id;
}

// Owners are always staff. A staff member adding a lead owns it; anything else
// (website form, a signed-in customer subscribing) is assigned from the pool —
// per-source, then default, then every active staff member.
export async function resolveOwner(sourceId: bigint, sourceKey: string, actorId: bigint | null): Promise<bigint> {
  if (actorId && (await isActiveStaff(actorId))) return actorId;
  const cfg = await getLeadAssignment();
  // "creator" has no staff creator to fall back on here, so it rotates instead.
  const strat = strategyFor(cfg, sourceKey) === "percentage" ? "percentage" : "round_robin";
  const sourcePool = await poolFor("inquiry", sourceId);
  const configured = sourcePool.length ? sourcePool : await poolFor("inquiry");
  const pool = configured.length ? configured : await activeStaffPool();
  if (!pool.length) return systemUserId();

  // percentage strategy only; derive from current epoch ms fractional — adequate for weighting
  const roll = (Date.now() % 1000) / 1000;
  const { chosen, cursorPublicId } = pickAssignee(strat, pool, cfg, sourceKey, roll);
  if (!chosen) return systemUserId();
  if (strat === "round_robin" && cursorPublicId) {
    await setLeadAssignment({ ...cfg, cursor: { ...cfg.cursor, [sourceKey]: cursorPublicId } });
  }
  return chosen.id;
}

export async function resolveZoneId(postalCode?: string): Promise<bigint | null> {
  if (!postalCode) return null;
  const { zones } = await loadCatalogSnapshot();
  return (await findZone(zones, { postalCode }))?.id ?? null;
}

/** Next never-resetting "Lead <n>" number for the org. Atomic; a failed insert just skips a number. */
export async function nextLeadNumber(organizationId: string | null): Promise<number> {
  const [row] = await db
    .insert(leadCounters)
    .values({ orgKey: organizationId ?? "", lastNumber: 1 })
    .onConflictDoUpdate({ target: leadCounters.orgKey, set: { lastNumber: sql`${leadCounters.lastNumber} + 1` } })
    .returning({ n: leadCounters.lastNumber });
  return row.n;
}

export type InquiryEvent = "inquiry_created" | "inquiry_follow_up" | "inquiry_converted" | "inquiry_reinquiry";

/** In-app note to the lead's owner, or to the franchise's staff when nobody owns it. Keyed so a retry adds nothing. */
export function notifyOwner(tx: Tx, inq: InquiryRow, n: { event: InquiryEvent; title: string; body: string; data?: Record<string, unknown>; dedupeKey: string }) {
  const note = { ...n, channels: ["in_app" as const], href: `/dashboard/inquiries/${inq.publicId}` };
  return inq.currentOwner != null ? enqueueNotification(tx, { ...note, recipientId: inq.currentOwner }) : enqueueStaffNotification(tx, { ...note, organizationId: inq.organizationId });
}
