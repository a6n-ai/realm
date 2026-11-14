// Links inquiries to the customer and order of each sales round. createOrder calls recordPurchase
// after its transaction commits, so this module may import only inquiry-core (see its header).
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, ne, notExists, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, orders, users } from "@/db/schema";
import { stageFor } from "@/lib/inquiries/status";
import { roundLabel } from "@/lib/inquiries/display";
import { laterOrderSql } from "@/lib/orders/queries";
import { addActivity, fillEmpty, findMatch, inquiryRows, resolveOwner, resolveSource, type InquiryRow } from "./inquiry-core";
import { getBrandOrgId } from "@/lib/services/organizations.service";

export type PurchaseInput = {
  orderId: bigint;
  userId: bigint;
  inquiryId?: string;
  contact: { fullName: string; email: string | null; phone: string | null };
  kind: "plan" | "trial";
  source: "website" | "manual";
};

const ROUND_EVENTS = ["converted", "renewed"] as const;

async function findInquiry(p: PurchaseInput): Promise<InquiryRow | null> {
  if (p.inquiryId) {
    const [byId] = await db.select().from(inquiries).where(eq(inquiries.publicId, p.inquiryId)).limit(1);
    if (byId) return byId;
  }
  const [byCustomer] = await db.select().from(inquiries).where(eq(inquiries.customerId, p.userId)).orderBy(desc(inquiries.updatedAt)).limit(1);
  if (byCustomer) return byCustomer;
  return (await findMatch(p.contact.phone, p.contact.email)).match;
}

async function createForBuyer(p: PurchaseInput): Promise<InquiryRow> {
  const { sourceId } = await resolveSource(p.source);
  const currentOwner = await resolveOwner(sourceId, p.source, null);
  const inq = await inquiryRows.create({
    fullName: p.contact.fullName,
    phone: p.contact.phone,
    email: p.contact.email,
    sourceId,
    currentOwner,
    stage: stageFor(null),
    organizationId: await getBrandOrgId(db),
  });
  await addActivity({ inquiryId: inq.id, type: "created", toStage: inq.stage, orderId: null, details: { origin: "purchase", source: p.source } });
  return inq;
}

/**
 * The one place an order links to its inquiry. A first sale converts the row; any later order is a
 * renewal round: the pointer moves and the renewal status resets, but the lead status stays converted.
 * Safe to call twice for one order. Returns null when the matched row belongs to another customer.
 */
export async function recordPurchase(p: PurchaseInput): Promise<{ inquiryPublicId: string; round: "first" | "renewal" } | null> {
  const inq = (await findInquiry(p)) ?? (await createForBuyer(p));
  if (inq.customerId != null && inq.customerId !== p.userId) {
    await addActivity({ inquiryId: inq.id, type: "match_conflict", orderId: p.orderId, note: "An order by a different customer matched this inquiry's contact.", details: { otherCustomer: true } });
    return null;
  }
  const [done] = await db
    .select({ type: inquiryActivities.type })
    .from(inquiryActivities)
    .where(and(eq(inquiryActivities.inquiryId, inq.id), eq(inquiryActivities.orderId, p.orderId), inArray(inquiryActivities.type, ROUND_EVENTS)))
    .limit(1);
  if (done) return { inquiryPublicId: inq.publicId, round: done.type === "converted" ? "first" : "renewal" };

  // Same rule as the round rank: the first sale is the customer's earliest order that was not cancelled, so an
  // abandoned checkout replaced by a real one (replaceOlderUnpaidCheckouts) does not turn the sale into a renewal.
  const [me] = await db.select({ createdAt: orders.createdAt }).from(orders).where(eq(orders.id, p.orderId)).limit(1);
  const [earlier] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.userId, p.userId), ne(orders.id, p.orderId), ne(orders.status, "cancelled"), lt(orders.createdAt, me?.createdAt ?? Date.now())))
    .limit(1);
  const isFirst = !earlier;

  // An order older than the one the row already points at (a missed link the reconcile found) is history only.
  if (inq.currentOrderId != null && inq.currentOrderId !== p.orderId) {
    const [cur] = await db.select({ createdAt: orders.createdAt, status: orders.status }).from(orders).where(eq(orders.id, inq.currentOrderId)).limit(1);
    if (cur && cur.status !== "cancelled" && me && me.createdAt < cur.createdAt) {
      await addActivity({ inquiryId: inq.id, type: isFirst ? "converted" : "renewed", orderId: p.orderId });
      return { inquiryPublicId: inq.publicId, round: isFirst ? "first" : "renewal" };
    }
  }

  if (isFirst) {
    const subStatus = p.kind === "trial" ? "took_trial" : "took_plan";
    const { patch } = await fillEmpty(inq, { fullName: p.contact.fullName, email: p.contact.email, phone: p.contact.phone });
    await inquiryRows.update(inq.publicId, {
      ...patch,
      customerId: p.userId,
      currentOrderId: p.orderId,
      subStatus,
      stage: stageFor(subStatus),
      nextFollowUpAt: null,
    });
    await addActivity({
      inquiryId: inq.id,
      type: "converted",
      orderId: p.orderId,
      fromStage: inq.stage,
      toStage: stageFor(subStatus),
      fromSubStatus: inq.subStatus,
      toSubStatus: subStatus,
    });
    return { inquiryPublicId: inq.publicId, round: "first" };
  }

  // A row that never saw this customer's first sale is still a lead: buying closes it.
  const closesLead = inq.stage !== "converted" ? { subStatus: p.kind === "trial" ? ("took_trial" as const) : ("took_plan" as const), stage: "converted" as const, nextFollowUpAt: null } : {};
  await inquiryRows.update(inq.publicId, {
    ...closesLead,
    customerId: p.userId,
    currentOrderId: p.orderId,
    renewalStatus: null,
    renewalStatusSetAt: null,
    renewalStatusSource: null,
    renewalFollowUpAt: null,
    renewalLostReason: null,
  });
  await addActivity({ inquiryId: inq.id, type: "renewed", orderId: p.orderId });
  return { inquiryPublicId: inq.publicId, round: "renewal" };
}

/** Customer created without an order: link only, never overwrite another customer. */
export async function linkCustomer(inquiryPublicId: string, userId: bigint): Promise<void> {
  const [inq] = await db.select().from(inquiries).where(eq(inquiries.publicId, inquiryPublicId)).limit(1);
  if (!inq || inq.customerId != null) return;
  await inquiryRows.update(inquiryPublicId, { customerId: userId });
}

/**
 * Daily repair: link orders recordPurchase missed (it never fails an order, so a failure leaves a gap),
 * and move the pointer off a cancelled current order.
 */
export async function reconcileOrders(sinceMs: number): Promise<{ linked: number; repointed: number }> {
  const unlinked = await db
    .select({ orderId: orders.id, userId: orders.userId, trialLength: orders.trialLength, name: users.name, email: users.email, phone: users.phone, fullName: orders.fullName })
    .from(orders)
    .innerJoin(users, eq(users.id, orders.userId))
    .where(
      and(
        gte(orders.createdAt, sinceMs),
        ne(orders.status, "cancelled"),
        notExists(
          db.select({ x: sql`1` }).from(inquiryActivities).where(and(eq(inquiryActivities.orderId, orders.id), inArray(inquiryActivities.type, ROUND_EVENTS))),
        ),
      ),
    )
    .orderBy(asc(orders.createdAt));
  let linked = 0;
  for (const o of unlinked) {
    const r = await recordPurchase({
      orderId: o.orderId,
      userId: o.userId!,
      contact: { fullName: o.name ?? o.fullName, email: o.email, phone: o.phone },
      kind: o.trialLength != null ? "trial" : "plan",
      source: "website",
    });
    if (r) linked++;
  }

  const stale = await db
    .select({ inq: inquiries })
    .from(inquiries)
    .innerJoin(orders, eq(orders.id, inquiries.currentOrderId))
    .where(and(eq(orders.status, "cancelled"), isNotNull(inquiries.customerId)));
  let repointed = 0;
  for (const { inq } of stale) {
    const [prev] = await db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.userId, inq.customerId!), ne(orders.status, "cancelled")))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    const tookSale = inq.subStatus === "took_plan" || inq.subStatus === "took_trial";
    try {
      await inquiryRows.update(inq.publicId, prev
        ? { currentOrderId: prev.id }
        : { currentOrderId: null, ...(tookSale ? { subStatus: null, stage: stageFor(null) } : {}) });
      repointed++;
    } catch {
      // Reopening can hit an open-row unique index (a pre-merge duplicate); just drop the pointer.
      await inquiryRows.update(inq.publicId, { currentOrderId: prev?.id ?? null });
      repointed++;
    }
  }
  return { linked, repointed };
}

async function orderBuyer(orderId: bigint) {
  const [o] = await db
    .select({ id: orders.id, userId: orders.userId, trialLength: orders.trialLength, fullName: orders.fullName, name: users.name, email: users.email, phone: users.phone })
    .from(orders)
    .leftJoin(users, eq(users.id, orders.userId))
    .where(eq(orders.id, orderId))
    .limit(1);
  return o;
}

/** The inquiry that tracks an order: the one pointing at it, else the customer's, else a contact match. Never creates. */
export async function inquiryForOrder(orderId: bigint): Promise<InquiryRow | null> {
  const [byPointer] = await db.select().from(inquiries).where(eq(inquiries.currentOrderId, orderId)).limit(1);
  if (byPointer) return byPointer;
  const o = await orderBuyer(orderId);
  if (!o?.userId) return null;
  const [byCustomer] = await db.select().from(inquiries).where(eq(inquiries.customerId, o.userId)).orderBy(desc(inquiries.updatedAt)).limit(1);
  if (byCustomer) return byCustomer;
  const { match } = await findMatch(o.phone, o.email);
  // A shared phone or email must not hand one customer's order to another customer's inquiry.
  return match && (match.customerId == null || match.customerId === o.userId) ? match : null;
}

/** Daily, as an order nears its end: open its renewal round once (auto `expected`). Skips once a later plan exists. */
export async function openRenewal(orderId: bigint): Promise<"opened" | "skipped"> {
  const [later] = await db.select({ later: laterOrderSql }).from(orders).where(eq(orders.id, orderId)).limit(1);
  if (!later || later.later) return "skipped";
  let inq = await inquiryForOrder(orderId);
  if (!inq) {
    const o = await orderBuyer(orderId);
    if (!o?.userId) return "skipped";
    await recordPurchase({
      orderId,
      userId: o.userId,
      contact: { fullName: o.name ?? o.fullName, email: o.email, phone: o.phone },
      kind: o.trialLength != null ? "trial" : "plan",
      source: "website",
    });
    inq = await inquiryForOrder(orderId);
    if (!inq) return "skipped";
  }
  const [started] = await db
    .select({ id: inquiryActivities.id })
    .from(inquiryActivities)
    .where(and(eq(inquiryActivities.inquiryId, inq.id), eq(inquiryActivities.orderId, orderId), eq(inquiryActivities.type, "renewal_started")))
    .limit(1);
  if (started) return "skipped";
  await inquiryRows.update(inq.publicId, {
    currentOrderId: orderId,
    renewalStatus: "expected",
    renewalStatusSource: "auto",
    renewalStatusSetAt: Date.now(),
  });
  await addActivity({ inquiryId: inq.id, type: "renewal_started", orderId, details: { renewalStatusTo: "expected" } });
  return "opened";
}

/** One reminder_sent activity per reminder key (the outbox dedupe key), so a cron rerun adds nothing. */
export async function logReminderSent(orderId: bigint, reminderKey?: string): Promise<void> {
  const inq = await inquiryForOrder(orderId);
  if (!inq) return;
  if (reminderKey) {
    const [dup] = await db
      .select({ id: inquiryActivities.id })
      .from(inquiryActivities)
      .where(and(eq(inquiryActivities.inquiryId, inq.id), eq(inquiryActivities.type, "reminder_sent"), sql`${inquiryActivities.details}->>'reminderKey' = ${reminderKey}`))
      .limit(1);
    if (dup) return;
  }
  await addActivity({ inquiryId: inq.id, type: "reminder_sent", orderId, details: reminderKey ? { reminderKey } : null });
}

export type RenewalMirror = {
  type: "note" | "call" | "whatsapp" | "email" | "callback" | "status_change" | "reminder_sent";
  note?: string | null;
  outcome?: string | null;
  nextFollowUpAt?: number | null;
  status?: { from: RenewalTrackStatus | null; to: RenewalTrackStatus | null; lostReason: LostReasonValue | null };
};
type RenewalTrackStatus = NonNullable<InquiryRow["renewalStatus"]>;
type LostReasonValue = NonNullable<InquiryRow["renewalLostReason"]>;

/**
 * A Renewals-desk write lands on the person's inquiry. The renewal columns change only for the inquiry's
 * current order; any order gets the activity on its round.
 */
export async function mirrorRenewalActivity(orderId: bigint, m: RenewalMirror): Promise<void> {
  const inq = await inquiryForOrder(orderId);
  if (!inq) return;
  if (inq.currentOrderId === orderId) {
    const patch: Partial<InquiryRow> = {};
    if (m.status) {
      Object.assign(patch, {
        renewalStatus: m.status.to,
        renewalStatusSource: "staff",
        renewalStatusSetAt: Date.now(),
        renewalLostReason: m.status.lostReason,
      });
    }
    if (m.nextFollowUpAt !== undefined) patch.renewalFollowUpAt = m.nextFollowUpAt;
    if (Object.keys(patch).length) await inquiryRows.update(inq.publicId, patch);
  }
  await addActivity({
    inquiryId: inq.id,
    orderId,
    type: m.type === "status_change" ? "stage_change" : m.type,
    note: m.note ?? null,
    outcome: m.outcome ?? null,
    nextFollowUpAt: m.nextFollowUpAt ?? null,
    lostReason: m.status?.lostReason ?? null,
    details: m.status ? { renewalStatusFrom: m.status.from, renewalStatusTo: m.status.to } : null,
  });
}

export type InquiryOrderCard = {
  publicId: string;
  fullName: string | null;
  ownerName: string | null;
  stage: InquiryRow["stage"];
  renewalStatus: InquiryRow["renewalStatus"];
  nextFollowUpAt: number | null;
  roundLabel: string;
};

/** The order page's inquiry summary. An inquiry outside the caller's visible orgs reads as none. */
export async function inquiryOrderCard(orderId: bigint, visible: "all" | string[]): Promise<InquiryOrderCard | null> {
  let inq = (await db.select().from(inquiries).where(eq(inquiries.currentOrderId, orderId)).limit(1))[0];
  if (!inq) {
    const [viaActivity] = await db
      .select({ inq: inquiries })
      .from(inquiryActivities)
      .innerJoin(inquiries, eq(inquiries.id, inquiryActivities.inquiryId))
      .where(eq(inquiryActivities.orderId, orderId))
      .limit(1);
    inq = viaActivity?.inq;
  }
  if (!inq) return null;
  if (visible !== "all" && (inq.organizationId == null || !visible.includes(inq.organizationId))) return null;
  const [owner] = inq.currentOwner != null ? await db.select({ name: users.name }).from(users).where(eq(users.id, inq.currentOwner)).limit(1) : [];
  const [rank] = await db
    .select({ n: sql<number>`(select count(*)::int from orders o2 where o2.user_id = ${orders.userId} and o2.created_at <= ${orders.createdAt})` })
    .from(orders)
    .where(eq(orders.id, orderId))
    .limit(1);
  return {
    publicId: inq.publicId,
    fullName: inq.fullName,
    ownerName: owner?.name ?? null,
    stage: inq.stage,
    renewalStatus: inq.renewalStatus,
    nextFollowUpAt: inq.renewalFollowUpAt ?? inq.nextFollowUpAt,
    roundLabel: roundLabel(rank?.n ?? null),
  };
}

/** The order's inquiry, creating and linking one for its buyer when none exists, so a desk write is never dropped. */
export async function ensureInquiryForOrder(orderId: bigint): Promise<InquiryRow | null> {
  const found = await inquiryForOrder(orderId);
  if (found) return found;
  const o = await orderBuyer(orderId);
  if (!o?.userId) return null;
  await recordPurchase({
    orderId,
    userId: o.userId,
    contact: { fullName: o.name ?? o.fullName, email: o.email, phone: o.phone },
    kind: o.trialLength != null ? "trial" : "plan",
    source: "website",
  });
  return inquiryForOrder(orderId);
}
