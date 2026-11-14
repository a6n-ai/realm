import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { ensureSystemUser, deleteNonSystemUsers } from "@/db/test-helpers";
import { db } from "@/db/client";
import { inquiries, inquiryActivities, leadSources, orders } from "@/db/schema";
import { insertTestInquiry, insertTestOrder, insertTestUser, resetInquiryData, testEmail } from "./helpers/inquiry-fixtures";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const links = await import("../inquiry-links.service");

async function reset() {
  await resetInquiryData();
  await db.delete(orders);
  await deleteNonSystemUsers();
}

const row = async (id: bigint) => (await db.select().from(inquiries).where(eq(inquiries.id, id)))[0];
const actsOf = (inquiryId: bigint, type: "converted" | "renewed" | "created" | "match_conflict") =>
  db.select().from(inquiryActivities).where(and(eq(inquiryActivities.inquiryId, inquiryId), eq(inquiryActivities.type, type)));

async function buyer(phone: string) {
  const email = testEmail("buyer");
  const u = await insertTestUser({ email, phone, name: "Asha Rao" });
  return { u, contact: { fullName: "Asha Rao", email, phone } };
}

describe("inquiry-links", () => {
  beforeEach(async () => {
    await reset();
    await ensureSystemUser();
  });
  afterAll(reset);

  it("first sale links the inquiry and converts it", async () => {
    const { u, contact } = await buyer("+16475551301");
    const inq = await insertTestInquiry({ phone: contact.phone, nextFollowUpAt: 99 });
    const o = await insertTestOrder(u.id);
    const r = await links.recordPurchase({ orderId: o.id, userId: u.id, contact, kind: "plan", source: "website" });
    expect(r).toEqual({ inquiryPublicId: inq.publicId, round: "first" });
    expect(await row(inq.id)).toMatchObject({
      customerId: u.id, currentOrderId: o.id, subStatus: "took_plan", stage: "converted", nextFollowUpAt: null,
    });
    const conv = await actsOf(inq.id, "converted");
    expect(conv).toHaveLength(1);
    expect(conv[0].orderId).toBe(o.id);
  });

  it("a trial first sale uses took_trial", async () => {
    const { u, contact } = await buyer("+16475551302");
    const inq = await insertTestInquiry({ phone: contact.phone });
    const o = await insertTestOrder(u.id, { trialLength: 3 });
    await links.recordPurchase({ orderId: o.id, userId: u.id, contact, kind: "trial", source: "website" });
    expect((await row(inq.id)).subStatus).toBe("took_trial");
  });

  it("fills a generated name and a missing email", async () => {
    const { u, contact } = await buyer("+16475551303");
    const inq = await insertTestInquiry({ phone: contact.phone, fullName: "Lead 3", leadNumber: 3 });
    const o = await insertTestOrder(u.id);
    await links.recordPurchase({ orderId: o.id, userId: u.id, contact, kind: "plan", source: "website" });
    expect(await row(inq.id)).toMatchObject({ fullName: "Asha Rao", email: contact.email });
  });

  it("a second purchase is a renewal round and leaves the lead status alone", async () => {
    const { u, contact } = await buyer("+16475551304");
    const inq = await insertTestInquiry({ phone: contact.phone });
    const o1 = await insertTestOrder(u.id);
    await links.recordPurchase({ orderId: o1.id, userId: u.id, contact, kind: "plan", source: "website" });
    await db.update(inquiries).set({ renewalStatus: "follow_up", renewalStatusSetAt: 1, renewalStatusSource: "staff", renewalFollowUpAt: 5 }).where(eq(inquiries.id, inq.id));
    const o2 = await insertTestOrder(u.id, { startDate: "2035-02-01" });
    const r = await links.recordPurchase({ orderId: o2.id, userId: u.id, contact, kind: "plan", source: "website" });
    expect(r?.round).toBe("renewal");
    expect(await row(inq.id)).toMatchObject({
      currentOrderId: o2.id, subStatus: "took_plan",
      renewalStatus: null, renewalStatusSetAt: null, renewalStatusSource: null, renewalFollowUpAt: null,
    });
    const renewed = await actsOf(inq.id, "renewed");
    expect(renewed.map((a) => a.orderId)).toEqual([o2.id]);
  });

  it("the same order twice writes one activity", async () => {
    const { u, contact } = await buyer("+16475551305");
    const inq = await insertTestInquiry({ phone: contact.phone });
    const o = await insertTestOrder(u.id);
    const p = { orderId: o.id, userId: u.id, contact, kind: "plan" as const, source: "website" as const };
    await links.recordPurchase(p);
    await links.recordPurchase(p);
    expect(await actsOf(inq.id, "converted")).toHaveLength(1);
    expect(await actsOf(inq.id, "renewed")).toHaveLength(0);
  });

  it("a buyer with no inquiry gets one with origin purchase", async () => {
    const { u, contact } = await buyer("+16475551306");
    const o = await insertTestOrder(u.id);
    const r = await links.recordPurchase({ orderId: o.id, userId: u.id, contact, kind: "plan", source: "website" });
    const [inq] = await db.select().from(inquiries).where(eq(inquiries.publicId, r!.inquiryPublicId));
    const [web] = await db.select({ id: leadSources.id }).from(leadSources).where(eq(leadSources.key, "website"));
    expect(inq).toMatchObject({ sourceId: web.id, customerId: u.id, currentOrderId: o.id, stage: "converted" });
    const [created] = await actsOf(inq.id, "created");
    expect(created.details).toMatchObject({ origin: "purchase" });
  });

  it("a different customer on the matched row writes match_conflict and links nothing", async () => {
    const { u, contact } = await buyer("+16475551307");
    const other = await insertTestUser();
    const inq = await insertTestInquiry({ phone: contact.phone, customerId: other.id });
    const o = await insertTestOrder(u.id);
    const r = await links.recordPurchase({ orderId: o.id, userId: u.id, contact, kind: "plan", source: "website" });
    expect(r).toBeNull();
    expect((await row(inq.id)).customerId).toBe(other.id);
    expect(await actsOf(inq.id, "match_conflict")).toHaveLength(1);
  });

  it("linkCustomer sets customer_id only when empty", async () => {
    const { u } = await buyer("+16475551308");
    const inq = await insertTestInquiry({ phone: "+16475551308" });
    await links.linkCustomer(inq.publicId, u.id);
    expect((await row(inq.id)).customerId).toBe(u.id);
    const other = await insertTestUser();
    await links.linkCustomer(inq.publicId, other.id);
    expect((await row(inq.id)).customerId).toBe(u.id);
  });

  it("reconcile links an unlinked order and repoints a cancelled current order", async () => {
    const { u, contact } = await buyer("+16475551309");
    const inq = await insertTestInquiry({ phone: contact.phone });
    const o1 = await insertTestOrder(u.id);
    await links.recordPurchase({ orderId: o1.id, userId: u.id, contact, kind: "plan", source: "website" });
    const o2 = await insertTestOrder(u.id, { startDate: "2035-02-01" });
    const first = await links.reconcileOrders(0);
    expect(first.linked).toBe(1);
    expect((await row(inq.id)).currentOrderId).toBe(o2.id);
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, o2.id));
    const second = await links.reconcileOrders(0);
    expect(second.repointed).toBe(1);
    expect((await row(inq.id)).currentOrderId).toBe(o1.id);
  });

  it("reconcile clears a first sale whose only order was cancelled", async () => {
    const { u, contact } = await buyer("+16475551310");
    const inq = await insertTestInquiry({ phone: contact.phone });
    const o1 = await insertTestOrder(u.id);
    await links.recordPurchase({ orderId: o1.id, userId: u.id, contact, kind: "plan", source: "website" });
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, o1.id));
    await links.reconcileOrders(0);
    expect(await row(inq.id)).toMatchObject({ currentOrderId: null, subStatus: null, stage: "new" });
  });

  it("inquiryOrderCard finds the order's inquiry and hides one outside the visible orgs", async () => {
    const { u, contact } = await buyer("+16475551311");
    const inq = await insertTestInquiry({ phone: contact.phone, organizationId: null });
    const o = await insertTestOrder(u.id);
    await links.recordPurchase({ orderId: o.id, userId: u.id, contact, kind: "plan", source: "website" });
    const card = await links.inquiryOrderCard(o.id, "all");
    expect(card).toMatchObject({ publicId: inq.publicId, stage: "converted", roundLabel: "First sale" });
    expect(await links.inquiryOrderCard(o.id, ["org_other"])).toBeNull();
  });

  it("review: inquiryForOrder never borrows another customer's inquiry by contact", async () => {
    const shared = "+16475551320";
    // users.phone is unique: the shared number lives on A's inquiry, and is B's login phone.
    const a = await insertTestUser();
    const b = await insertTestUser({ phone: shared });
    const aInq = await insertTestInquiry({ phone: shared, customerId: a.id });
    const bOrder = await insertTestOrder(b.id);
    expect(await links.inquiryForOrder(bOrder.id)).toBeNull();
    expect((await row(aInq.id)).currentOrderId).toBeNull();
  });

  it("review: a first sale after a cancelled checkout is still a first sale", async () => {
    const { u, contact } = await buyer("+16475551321");
    const inq = await insertTestInquiry({ phone: contact.phone });
    const abandoned = await insertTestOrder(u.id);
    await links.recordPurchase({ orderId: abandoned.id, userId: u.id, contact, kind: "plan", source: "website" });
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, abandoned.id));
    const real = await insertTestOrder(u.id, { startDate: "2035-02-01" });
    const r = await links.recordPurchase({ orderId: real.id, userId: u.id, contact, kind: "plan", source: "website" });
    expect(r?.round).toBe("first");
    expect(await actsOf(inq.id, "renewed")).toHaveLength(0);
    expect((await row(inq.id)).currentOrderId).toBe(real.id);
  });

  it("review: linking an older missed order never moves the pointer back", async () => {
    const { u, contact } = await buyer("+16475551322");
    const inq = await insertTestInquiry({ phone: contact.phone });
    const older = await insertTestOrder(u.id, { createdAt: 1_000 });
    const newer = await insertTestOrder(u.id, { startDate: "2035-02-01", createdAt: 2_000 });
    await links.recordPurchase({ orderId: newer.id, userId: u.id, contact, kind: "plan", source: "website" });
    await db.update(inquiries).set({ renewalStatus: "follow_up" }).where(eq(inquiries.id, inq.id));
    await links.recordPurchase({ orderId: older.id, userId: u.id, contact, kind: "plan", source: "website" });
    const after = await row(inq.id);
    expect(after.currentOrderId).toBe(newer.id);
    expect(after.renewalStatus).toBe("follow_up");
    expect(after.stage).toBe("converted");
    // By rank the older order is the sale and the newer one the renewal, whatever order they were linked in.
    expect((await actsOf(inq.id, "converted")).map((a) => a.orderId)).toEqual([older.id]);
    expect((await actsOf(inq.id, "renewed")).map((a) => a.orderId)).toEqual([newer.id]);
  });
});

