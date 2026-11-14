// Links inquiries to the customer and order of each sales round. createOrder calls recordPurchase
// after its transaction commits, so this module may import only inquiry-core (see its header).
import { and, asc, desc, eq, gte, inArray, isNotNull, ne, notExists, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, orders, users } from "@/db/schema";
import { stageFor } from "@/lib/inquiries/status";
import { addActivity, fillEmpty, findMatch, inquiryRows, resolveOwner, resolveSource, type InquiryRow } from "./inquiry-core";
import { getBrandOrgId } from "./organizations.service";

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

  if (inq.currentOrderId == null) {
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

  await inquiryRows.update(inq.publicId, {
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
    await inquiryRows.update(inq.publicId, prev
      ? { currentOrderId: prev.id }
      : { currentOrderId: null, ...(tookSale ? { subStatus: null, stage: stageFor(null) } : {}) });
    repointed++;
  }
  return { linked, repointed };
}
