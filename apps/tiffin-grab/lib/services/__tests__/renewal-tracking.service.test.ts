import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, inArray, ne, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deleteNonSystemUsers } = await import("@/db/test-helpers");
const { orders, payments, orderActivities, ledgerEntries, users, walletLedger, deliveries, notifications, notificationOutbox, renewals, renewalActivities } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder } = await import("../create-order");
const { addTrackNote, followUpWhere, getTrackRows, latestTrackActivities, listTrackActivities, logTrackActivity, setTrackStatus } = await import("../renewal-tracking.service");
const { addDaysIso: addDays } = await import("@foundry/commons/util/dates");

async function reset() {
  await db.delete(renewalActivities);
  await db.delete(renewals);
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  const customerIds = db.select({ id: users.id }).from(users).where(ne(users.isSystem, true));
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, customerIds));
  await db.delete(notifications).where(inArray(notifications.userId, customerIds));
  await deleteNonSystemUsers();
}

let phone = 900;
async function plan(status: "active" | "completed" = "active") {
  const snap = await loadCatalogSnapshot();
  const o = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId,
      frequencyKey: "5_day" as const,
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `t${Math.random().toString(36).slice(2)}@test.invalid`, fullName: "Tara Track", phone: `+16475550${phone++}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [row] = await db.update(orders).set({ status }).where(eq(orders.publicId, o.publicId)).returning({ id: orders.id, userId: orders.userId });
  const [{ last }] = await db.select({ last: sql<string>`max(${deliveries.deliveryDate})` }).from(deliveries).where(eq(deliveries.orderId, row.id));
  return { publicId: o.publicId, id: row.id, userId: row.userId!, last };
}

// A second plan for the same customer, starting a week after the first. It keeps the first's
// tiffins, so its last tiffin is not earlier than the first's (the later-plan rule).
async function laterPlan(first: { id: bigint; userId: bigint }, set: Partial<typeof orders.$inferInsert>) {
  const [f] = await db.select({ start: orders.startDate }).from(orders).where(eq(orders.id, first.id));
  const next = await plan();
  // createOrder books a paid payment, which would count as renewed even for a pending plan.
  await db.update(payments).set({ status: "awaiting_payment" }).where(eq(payments.orderId, next.id));
  await db.update(orders).set({ userId: first.userId, startDate: addDays(f.start, 7), ...set }).where(eq(orders.id, next.id));
  return next;
}

const rowOf = async (publicId: string) => (await getTrackRows([publicId])).get(publicId);

describe("renewal tracking (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("untouched plan has no row and status New", async () => {
    const p = await plan();
    expect((await rowOf(p.publicId))?.status).toBeNull();
    expect(await db.select().from(renewals)).toEqual([]);
  });

  it("note on untouched plan creates the row with null status", async () => {
    const p = await plan();
    await addTrackNote(p.publicId, "Left a voicemail", undefined);
    expect((await rowOf(p.publicId))?.status).toBeNull();
    expect(await db.select().from(renewals)).toHaveLength(1);
    const acts = (await listTrackActivities([p.publicId])).get(p.publicId) ?? [];
    expect(acts.map((a) => [a.type, a.note])).toEqual([["note", "Left a voicemail"]]);
    expect(acts[0].actor.kind).toBe("system");
  });

  it("not_renewed requires a reason", async () => {
    const p = await plan();
    await expect(setTrackStatus(p.publicId, { status: "not_renewed" })).rejects.toThrow(/reason is required/);
  });

  it("closed status clears follow-up and logs the change", async () => {
    const p = await plan();
    const at = Date.parse("2099-03-01T15:00:00Z");
    await setTrackStatus(p.publicId, { status: "follow_up", nextFollowUpAt: at });
    expect((await rowOf(p.publicId))?.nextFollowUpAt).toBe(at);
    const { previous } = await setTrackStatus(p.publicId, { status: "renewed" });
    expect(previous).toBe("follow_up");
    expect((await rowOf(p.publicId))).toMatchObject({ status: "renewed", source: "staff", nextFollowUpAt: null });
    const [r] = await db.select().from(renewals).where(eq(renewals.orderId, p.id));
    expect(r.nextFollowUpAt).toBeNull();
    const statusChanges = await db.select().from(renewalActivities).where(eq(renewalActivities.type, "status_change"));
    expect(statusChanges.map((a) => [a.fromStatus, a.toStatus]).sort()).toEqual([[null, "follow_up"], ["follow_up", "renewed"]]);
  });

  it("closed plan rejects a follow-up note", async () => {
    const p = await plan();
    await setTrackStatus(p.publicId, { status: "not_renewed", lostReason: "price" });
    await expect(addTrackNote(p.publicId, "later?", Date.now() + 1000)).rejects.toThrow(/closed plan/);
  });

  it("auto renewed while later plan lives, reverts after cancel", async () => {
    const p = await plan();
    await setTrackStatus(p.publicId, { status: "expected" });
    const next = await laterPlan(p, { status: "active" });
    expect(await rowOf(p.publicId)).toMatchObject({ status: "renewed", source: "auto" });
    await db.update(orders).set({ status: "cancelled" }).where(eq(orders.id, next.id));
    expect(await rowOf(p.publicId)).toMatchObject({ status: "expected", source: "staff" });
  });

  it("staff change after auto wins", async () => {
    const p = await plan();
    await laterPlan(p, { status: "active" });
    expect(await rowOf(p.publicId)).toMatchObject({ status: "renewed", source: "auto" });
    await setTrackStatus(p.publicId, { status: "unresponsive" });
    expect(await rowOf(p.publicId)).toMatchObject({ status: "unresponsive", source: "staff" });
  });

  it("trial with only a later trial gets no auto status", async () => {
    const p = await plan();
    await db.update(orders).set({ trialLength: 3 }).where(eq(orders.id, p.id));
    await laterPlan(p, { trialLength: 3, status: "active" });
    expect((await rowOf(p.publicId))?.status).toBeNull();
  });

  it("trial with a later paid plan is renewed", async () => {
    const p = await plan();
    await db.update(orders).set({ trialLength: 3 }).where(eq(orders.id, p.id));
    await laterPlan(p, { status: "active" });
    expect(await rowOf(p.publicId)).toMatchObject({ status: "renewed", source: "auto" });
  });

  it("unpaid later plan gives pending_payment", async () => {
    const p = await plan();
    await laterPlan(p, { status: "pending" });
    expect(await rowOf(p.publicId)).toMatchObject({ status: "pending_payment", source: "auto" });
  });

  it("followUpWhere due/overdue/upcoming/none, closed rows excluded", async () => {
    const dayStart = Date.parse("2099-05-10T00:00:00Z");
    const dayEnd = dayStart + 86_400_000;
    const overdue = await plan();
    const due = await plan();
    const upcoming = await plan();
    const untouched = await plan();
    const stale = await plan();
    await setTrackStatus(overdue.publicId, { status: "follow_up", nextFollowUpAt: dayStart - 1 });
    await setTrackStatus(due.publicId, { status: "follow_up", nextFollowUpAt: dayStart + 1000 });
    await setTrackStatus(upcoming.publicId, { status: "follow_up", nextFollowUpAt: dayEnd + 1000 });
    await setTrackStatus(stale.publicId, { status: "follow_up", nextFollowUpAt: dayStart + 1000 });
    await laterPlan(stale, { status: "active" });

    const idsFor = async (kind: "due" | "overdue" | "upcoming" | "none") => {
      const rows = await db
        .select({ publicId: orders.publicId })
        .from(orders)
        .leftJoin(renewals, eq(renewals.orderId, orders.id))
        .where(followUpWhere(kind, dayStart, dayEnd));
      return rows.map((r) => r.publicId);
    };
    expect(await idsFor("due")).toEqual([due.publicId]);
    expect(await idsFor("overdue")).toEqual([overdue.publicId]);
    expect(await idsFor("upcoming")).toEqual([upcoming.publicId]);
    const none = await idsFor("none");
    expect(none).toContain(untouched.publicId);
    expect(none).not.toContain(stale.publicId);
  });

  it("logTrackActivity stores the call and sets the follow-up", async () => {
    const p = await plan();
    await logTrackActivity(p.publicId, { type: "call", outcome: "no answer", nextFollowUpAt: Date.parse("2099-03-02T15:00:00Z") });
    expect((await rowOf(p.publicId))?.nextFollowUpAt).toBe(Date.parse("2099-03-02T15:00:00Z"));
    const acts = (await listTrackActivities([p.publicId])).get(p.publicId) ?? [];
    expect(acts.map((a) => [a.type, a.outcome])).toEqual([["call", "no answer"]]);
  });

  it("latestTrackActivities keeps only the newest qualifying activity per order", async () => {
    const p = await plan();
    const other = await plan();
    await addTrackNote(p.publicId, "first", undefined);
    await logTrackActivity(p.publicId, { type: "call", outcome: "no answer" });
    await addTrackNote(p.publicId, "newest", undefined);
    await setTrackStatus(p.publicId, { status: "follow_up" });
    const latest = await latestTrackActivities([p.publicId, other.publicId]);
    expect(latest.get(p.publicId)).toEqual({ type: "note", note: "newest", at: expect.any(Number) });
    expect(latest.has(other.publicId)).toBe(false);
  });
});
