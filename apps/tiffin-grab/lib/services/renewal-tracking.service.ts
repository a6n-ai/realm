import { db } from "@/db/client";
import { renewalActivities, renewals, orders, users } from "@/db/schema";
import { isUniqueViolation } from "@/lib/db/errors";
import { laterBookedAtFor, renewalStatusSql, type RenewalStatus } from "@/lib/orders/queries";
import { effectiveTrackStatus, isClosedTrack, type TrackStatus } from "@/lib/renewals/status";
import { NotFoundError, ValidationError } from "@foundry/commons";
import { BaseRepository, UpdatableRepository } from "@foundry/database";
import { and, desc, eq, gte, inArray, isNull, lt, sql, type SQL } from "drizzle-orm";
import { assertFiniteFollowUp, type LostReason } from "./inquiries.service";
import { SessionBaseService, SessionUpdatableService } from "./session-service";

export const computedStatusSql = sql<RenewalStatus>`(case when ${orders.trialLength} is not null then ${renewalStatusSql(true)} else ${renewalStatusSql(false)} end)`;

export const laterBookedAtSql = sql<number | null>`(case when ${orders.trialLength} is not null then ${laterBookedAtFor(true)} else ${laterBookedAtFor(false)} end)`;

const autoSql = sql`(case when ${computedStatusSql} = 'renewed' then 'renewed' when ${computedStatusSql} in ('unpaid', 'waitlisted') then 'pending_payment' else null end)`;

// Same rule as effectiveTrackStatus in lib/renewals/status.ts; keep the two in step.
export const effectiveTrackStatusSql = sql<TrackStatus | null>`(case
  when ${autoSql} is not null and (${renewals.statusSetAt} is null or (${laterBookedAtSql} is not null and ${laterBookedAtSql} > ${renewals.statusSetAt})) then ${autoSql}
  else cast(${renewals.status} as text) end)`;

// Needs `renewals` left-joined on renewals.order_id = orders.id. Closed rows never show a follow-up.
const openTrackSql = sql`(${effectiveTrackStatusSql} is null or ${effectiveTrackStatusSql} not in ('renewed', 'not_renewed'))`;

export function followUpWhere(kind: "due" | "overdue" | "upcoming" | "none", dayStart: number, dayEnd: number): SQL {
  const at = renewals.nextFollowUpAt;
  const when =
    kind === "due" ? and(gte(at, dayStart), lt(at, dayEnd))
    : kind === "overdue" ? lt(at, dayStart)
    : kind === "upcoming" ? gte(at, dayEnd)
    : isNull(at);
  return sql`(${when}) and ${openTrackSql}`;
}

export type TrackRow = {
  status: TrackStatus | null;
  source: "staff" | "auto" | null;
  lostReason: LostReason | null;
  nextFollowUpAt: number | null;
};

export type RenewalActivityType = (typeof renewalActivities.type.enumValues)[number];

export type TrackActivity = {
  publicId: string;
  type: RenewalActivityType;
  note: string | null;
  outcome: string | null;
  fromStatus: TrackStatus | null;
  toStatus: TrackStatus | null;
  nextFollowUpAt: number | null;
  createdAt: number;
  actor: { label: string; kind: "system" | "staff" };
};

// Audit fields stamp from the session in the base layer, so no actor argument.
const renewalsService = new SessionUpdatableService(new UpdatableRepository(db, renewals, renewals.publicId, renewals.id));
const renewalActivitiesService = new SessionBaseService(
  new BaseRepository(db, renewalActivities, renewalActivities.publicId, renewalActivities.id),
);

type RenewalRow = typeof renewals.$inferSelect;

async function orderFor(orderPublicId: string) {
  const [o] = await db
    .select({ id: orders.id, organizationId: orders.organizationId })
    .from(orders)
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!o) throw new NotFoundError(`Not found: ${orderPublicId}`);
  return o;
}

async function renewalFor(orderId: bigint): Promise<RenewalRow | undefined> {
  const [r] = await db.select().from(renewals).where(eq(renewals.orderId, orderId)).limit(1);
  return r;
}

// An untouched plan has no renewals row; the first write creates it.
async function ensureRenewal(orderPublicId: string): Promise<RenewalRow> {
  const order = await orderFor(orderPublicId);
  const existing = await renewalFor(order.id);
  if (existing) return existing;
  try {
    return await renewalsService.create({ orderId: order.id, organizationId: order.organizationId });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    return (await renewalFor(order.id))!;
  }
}

async function statusOf(orderPublicId: string): Promise<TrackStatus | null> {
  return (await getTrackRows([orderPublicId])).get(orderPublicId)?.status ?? null;
}

export async function setTrackStatus(
  orderPublicId: string,
  input: { status: TrackStatus | null; lostReason?: LostReason; note?: string; nextFollowUpAt?: number | null },
): Promise<{ previous: TrackStatus | null }> {
  if (input.status === "not_renewed" && !input.lostReason) throw new ValidationError("A reason is required to mark a plan not renewed");
  assertFiniteFollowUp(input.nextFollowUpAt);
  const renewal = await ensureRenewal(orderPublicId);
  const previous = await statusOf(orderPublicId);
  const closed = isClosedTrack(input.status);
  const nextFollowUpAt = closed ? null : input.nextFollowUpAt === undefined ? renewal.nextFollowUpAt : input.nextFollowUpAt;
  const lostReason = input.status === "not_renewed" ? (input.lostReason ?? null) : null;

  await renewalsService.update(renewal.publicId, { status: input.status, lostReason, statusSetAt: Date.now(), nextFollowUpAt });
  await renewalActivitiesService.create({
    renewalId: renewal.id,
    organizationId: renewal.organizationId,
    type: "status_change",
    fromStatus: previous,
    toStatus: input.status,
    note: input.note?.trim() || null,
    nextFollowUpAt,
  });
  return { previous };
}

async function recordActivity(
  orderPublicId: string,
  input: { type: RenewalActivityType; note?: string; outcome?: string; nextFollowUpAt?: number },
) {
  assertFiniteFollowUp(input.nextFollowUpAt);
  const renewal = await ensureRenewal(orderPublicId);
  if (input.nextFollowUpAt != null && isClosedTrack(await statusOf(orderPublicId))) {
    throw new ValidationError("A closed plan cannot have a follow-up");
  }
  await renewalActivitiesService.create({
    renewalId: renewal.id,
    organizationId: renewal.organizationId,
    type: input.type,
    note: input.note ?? null,
    outcome: input.outcome ?? null,
    nextFollowUpAt: input.nextFollowUpAt ?? null,
  });
  if (input.nextFollowUpAt != null) await renewalsService.update(renewal.publicId, { nextFollowUpAt: input.nextFollowUpAt });
}

export function addTrackNote(orderPublicId: string, note: string, nextFollowUpAt?: number): Promise<void> {
  return recordActivity(orderPublicId, { type: "note", note, nextFollowUpAt });
}

export function logTrackActivity(
  orderPublicId: string,
  input: { type: "call" | "whatsapp" | "email" | "callback" | "reminder_sent"; note?: string; outcome?: string; nextFollowUpAt?: number },
): Promise<void> {
  return recordActivity(orderPublicId, input);
}

export async function listTrackActivities(orderPublicIds: string[]): Promise<Map<string, TrackActivity[]>> {
  const out = new Map<string, TrackActivity[]>();
  if (!orderPublicIds.length) return out;
  const rows = await db
    .select({
      orderPublicId: orders.publicId,
      publicId: renewalActivities.publicId,
      type: renewalActivities.type,
      note: renewalActivities.note,
      outcome: renewalActivities.outcome,
      fromStatus: renewalActivities.fromStatus,
      toStatus: renewalActivities.toStatus,
      nextFollowUpAt: renewalActivities.nextFollowUpAt,
      createdAt: renewalActivities.createdAt,
      createdBy: renewalActivities.createdBy,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(renewalActivities)
    .innerJoin(renewals, eq(renewals.id, renewalActivities.renewalId))
    .innerJoin(orders, eq(orders.id, renewals.orderId))
    .leftJoin(users, eq(users.id, renewalActivities.createdBy))
    .where(inArray(orders.publicId, orderPublicIds))
    .orderBy(desc(renewalActivities.createdAt));
  for (const { orderPublicId, createdBy, actorName, actorEmail, ...a } of rows) {
    const list = out.get(orderPublicId) ?? [];
    list.push({ ...a, actor: { label: actorName ?? actorEmail ?? "System", kind: createdBy == null ? "system" : "staff" } });
    out.set(orderPublicId, list);
  }
  return out;
}

const LATEST_CHUNK = 1000;

/** Newest activity per order, skipping bare status changes. Chunked to keep the IN list small on big exports. */
export async function latestTrackActivities(orderPublicIds: string[]): Promise<Map<string, { type: RenewalActivityType; note: string | null; at: number }>> {
  const out = new Map<string, { type: RenewalActivityType; note: string | null; at: number }>();
  for (let i = 0; i < orderPublicIds.length; i += LATEST_CHUNK) {
    const rows = await db
      .selectDistinctOn([orders.publicId], {
        orderPublicId: orders.publicId,
        type: renewalActivities.type,
        note: renewalActivities.note,
        at: renewalActivities.createdAt,
      })
      .from(renewalActivities)
      .innerJoin(renewals, eq(renewals.id, renewalActivities.renewalId))
      .innerJoin(orders, eq(orders.id, renewals.orderId))
      .where(
        and(
          inArray(orders.publicId, orderPublicIds.slice(i, i + LATEST_CHUNK)),
          sql`not (${renewalActivities.type} = 'status_change' and (${renewalActivities.note} is null or ${renewalActivities.note} = ''))`,
        ),
      )
      .orderBy(orders.publicId, desc(renewalActivities.createdAt), desc(renewalActivities.id));
    for (const { orderPublicId, ...a } of rows) out.set(orderPublicId, a);
  }
  return out;
}

export async function getTrackRows(orderPublicIds: string[]): Promise<Map<string, TrackRow>> {
  const out = new Map<string, TrackRow>();
  if (!orderPublicIds.length) return out;
  const rows = await db
    .select({
      orderPublicId: orders.publicId,
      status: effectiveTrackStatusSql,
      computed: computedStatusSql,
      laterBookedAt: laterBookedAtSql,
      staff: renewals.status,
      staffSetAt: renewals.statusSetAt,
      lostReason: renewals.lostReason,
      nextFollowUpAt: renewals.nextFollowUpAt,
    })
    .from(orders)
    .leftJoin(renewals, eq(renewals.orderId, orders.id))
    .where(inArray(orders.publicId, orderPublicIds));
  for (const r of rows) {
    const { source } = effectiveTrackStatus({ staff: r.staff, staffSetAt: r.staffSetAt, computed: r.computed, laterBookedAt: r.laterBookedAt });
    out.set(r.orderPublicId, {
      status: r.status,
      source,
      lostReason: r.status === "not_renewed" ? r.lostReason : null,
      nextFollowUpAt: isClosedTrack(r.status) ? null : r.nextFollowUpAt,
    });
  }
  return out;
}
