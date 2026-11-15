import { db } from "@/db/client";
import { inquiryActivities, orders, users } from "@/db/schema";
import { effectiveTrackStatus, isClosedTrack, type TrackActivityType, type TrackStatus } from "@/lib/renewals/status";
import { NotFoundError, ValidationError } from "@foundry/commons";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { assertFiniteFollowUp, type LostReason } from "../inquiries/lost-reason";
import { ensureInquiryForOrder, logReminderSent, mirrorRenewalActivity } from "@/lib/inquiries/inquiry-links.service";
import { loadPlanFacts, type PlanFact } from "./renewal-facts";

export type TrackRow = {
  status: TrackStatus | null;
  source: "staff" | "auto" | null;
  lostReason: LostReason | null;
  nextFollowUpAt: number | null;
  /** When the newest later plan was booked (epoch ms), or null: an auto status's timeline entry. */
  laterBookedAt: number | null;
};

export type TrackActivity = {
  publicId: string;
  type: TrackActivityType;
  note: string | null;
  outcome: string | null;
  fromStatus: TrackStatus | null;
  toStatus: TrackStatus | null;
  nextFollowUpAt: number | null;
  createdAt: number;
  actor: { label: string; kind: "system" | "staff" };
};

type InquiryActivityType = (typeof inquiryActivities.type.enumValues)[number];

// Other inquiry activity types (created, converted, ...) are not track activities.
const TRACK_TYPES: InquiryActivityType[] = ["note", "call", "whatsapp", "email", "callback", "reminder_sent"];
const isStatusChange = sql`(${inquiryActivities.type} = 'stage_change' and ${inquiryActivities.details} -> 'renewalStatusTo' is not null)`;
const trackActivityWhere = or(inArray(inquiryActivities.type, TRACK_TYPES), isStatusChange);

function trackType(type: InquiryActivityType): TrackActivityType {
  return type === "stage_change" ? "status_change" : (type as TrackActivityType);
}

async function orderFor(orderPublicId: string) {
  const [o] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!o) throw new NotFoundError(`Not found: ${orderPublicId}`);
  return o;
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
  const order = await orderFor(orderPublicId);
  // A plan with no inquiry gets its round opened first, so the status has a row to live on.
  await ensureInquiryForOrder(order.id);
  const previous = await statusOf(orderPublicId);
  const closed = isClosedTrack(input.status);
  const nextFollowUpAt = closed ? null : input.nextFollowUpAt;
  const lostReason = input.status === "not_renewed" ? (input.lostReason ?? null) : null;
  await mirrorRenewalActivity(order.id, {
    type: "status_change",
    note: input.note?.trim() || null,
    nextFollowUpAt,
    status: { from: previous, to: input.status, lostReason },
  });
  return { previous };
}

async function recordActivity(
  orderPublicId: string,
  input: { type: TrackActivityType; note?: string; outcome?: string; nextFollowUpAt?: number; reminderKey?: string },
) {
  assertFiniteFollowUp(input.nextFollowUpAt);
  const order = await orderFor(orderPublicId);
  if (input.nextFollowUpAt != null && isClosedTrack(await statusOf(orderPublicId))) {
    throw new ValidationError("A closed plan cannot have a follow-up");
  }
  await ensureInquiryForOrder(order.id);
  if (input.type === "reminder_sent") {
    await logReminderSent(order.id, input.reminderKey);
    return;
  }
  await mirrorRenewalActivity(order.id, {
    type: input.type,
    note: input.note ?? null,
    outcome: input.outcome ?? null,
    ...(input.nextFollowUpAt != null ? { nextFollowUpAt: input.nextFollowUpAt } : {}),
  });
}

export function addTrackNote(orderPublicId: string, note: string, nextFollowUpAt?: number): Promise<void> {
  return recordActivity(orderPublicId, { type: "note", note, nextFollowUpAt });
}

export function logTrackActivity(
  orderPublicId: string,
  input: { type: "call" | "whatsapp" | "email" | "callback" | "reminder_sent"; note?: string; outcome?: string; nextFollowUpAt?: number; reminderKey?: string },
): Promise<void> {
  return recordActivity(orderPublicId, input);
}

export async function listTrackActivities(orderPublicIds: string[]): Promise<Map<string, TrackActivity[]>> {
  const out = new Map<string, TrackActivity[]>();
  if (!orderPublicIds.length) return out;
  const rows = await db
    .select({
      orderPublicId: orders.publicId,
      publicId: inquiryActivities.publicId,
      type: inquiryActivities.type,
      note: inquiryActivities.note,
      outcome: inquiryActivities.outcome,
      details: inquiryActivities.details,
      nextFollowUpAt: inquiryActivities.nextFollowUpAt,
      createdAt: inquiryActivities.createdAt,
      createdBy: inquiryActivities.createdBy,
      actorName: users.name,
      actorEmail: users.email,
    })
    .from(inquiryActivities)
    .innerJoin(orders, eq(orders.id, inquiryActivities.orderId))
    .leftJoin(users, eq(users.id, inquiryActivities.createdBy))
    .where(and(inArray(orders.publicId, orderPublicIds), trackActivityWhere))
    .orderBy(desc(inquiryActivities.createdAt));
  for (const { orderPublicId, publicId, type, note, outcome, details, nextFollowUpAt, createdAt, createdBy, actorName, actorEmail } of rows) {
    const d = (details ?? {}) as { renewalStatusFrom?: TrackStatus | null; renewalStatusTo?: TrackStatus | null };
    const list = out.get(orderPublicId) ?? [];
    list.push({
      publicId,
      type: trackType(type),
      note,
      outcome,
      fromStatus: type === "stage_change" ? (d.renewalStatusFrom ?? null) : null,
      toStatus: type === "stage_change" ? (d.renewalStatusTo ?? null) : null,
      nextFollowUpAt,
      createdAt,
      actor: { label: actorName ?? actorEmail ?? "System", kind: createdBy == null ? "system" : "staff" },
    });
    out.set(orderPublicId, list);
  }
  return out;
}

const LATEST_CHUNK = 1000;

/** Newest activity per order, skipping bare status changes. Chunked to keep the IN list small on big exports. */
export async function latestTrackActivities(orderPublicIds: string[]): Promise<Map<string, { type: TrackActivityType; note: string | null; at: number }>> {
  const out = new Map<string, { type: TrackActivityType; note: string | null; at: number }>();
  for (let i = 0; i < orderPublicIds.length; i += LATEST_CHUNK) {
    const rows = await db
      .selectDistinctOn([orders.publicId], {
        orderPublicId: orders.publicId,
        type: inquiryActivities.type,
        note: inquiryActivities.note,
        at: inquiryActivities.createdAt,
      })
      .from(inquiryActivities)
      .innerJoin(orders, eq(orders.id, inquiryActivities.orderId))
      .where(
        and(
          inArray(orders.publicId, orderPublicIds.slice(i, i + LATEST_CHUNK)),
          trackActivityWhere,
          sql`not (${isStatusChange} and (${inquiryActivities.note} is null or ${inquiryActivities.note} = ''))`,
        ),
      )
      .orderBy(orders.publicId, desc(inquiryActivities.createdAt), desc(inquiryActivities.id));
    for (const { orderPublicId, type, note, at } of rows) out.set(orderPublicId, { type: trackType(type), note, at });
  }
  return out;
}

/** `facts`: already loaded plan facts covering these orders, to skip loading them again. */
export async function getTrackRows(orderPublicIds: string[], facts?: readonly PlanFact[]): Promise<Map<string, TrackRow>> {
  const out = new Map<string, TrackRow>();
  if (!orderPublicIds.length) return out;
  const wanted = new Set(orderPublicIds);
  for (const f of facts ?? (await loadPlanFacts(orderPublicIds))) {
    if (!wanted.has(f.orderPublicId)) continue;
    const { source } = effectiveTrackStatus({ staff: f.trackStaff, staffSetAt: f.trackStaffSetAt, staffSource: f.trackStaffSource, computed: f.renewal, laterBookedAt: f.laterBookedAtLatest });
    out.set(f.orderPublicId, {
      status: f.track,
      source,
      lostReason: f.track === "not_renewed" ? f.trackLostReason : null,
      nextFollowUpAt: isClosedTrack(f.track) ? null : f.trackFollowUpAt,
      laterBookedAt: f.laterBookedAtLatest,
    });
  }
  return out;
}
