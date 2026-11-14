import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, or } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { dayRange } from "@foundry/commons/util/dates";
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@foundry/places", async (orig) => ({ ...(await orig<object>()), resolveAndPersist: async () => null }));
const { db } = await import("@/db/client");
const { deliveries, inquiries, inquiryActivities, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../../orders/create-order");
const { setTrackStatus } = await import("../renewal-tracking.service");
const { recommendedRenewals } = await import("../next-renewal.service");
const DAY = 86_400_000;
const TZ = "UTC";
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const today = iso(0);
const { start: dayStart, end: dayEnd } = dayRange(today, TZ);
const day = { dayStart, dayEnd };
const scope = { visible: "all" as const, owner: null };
const created: { id: bigint; userId: bigint | null; publicId: string }[] = [];
const cleanup = async () => {
  if (created.length === 0) return;
  const ids = created.map((o) => o.id);
  const userIds = created.map((o) => o.userId).filter((id): id is bigint => id != null);
  const linked = db.select({ id: inquiries.id }).from(inquiries).where(or(inArray(inquiries.currentOrderId, ids), userIds.length ? inArray(inquiries.customerId, userIds) : undefined));
  await db.delete(inquiryActivities).where(inArray(inquiryActivities.inquiryId, linked));
  await db.delete(inquiries).where(inArray(inquiries.id, linked));
  await db.delete(deliveries).where(inArray(deliveries.orderId, ids));
  await db.delete(orderActivities).where(inArray(orderActivities.orderId, ids));
  await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, ids));
  await db.delete(payments).where(inArray(payments.orderId, ids));
  await db.delete(orders).where(inArray(orders.id, ids));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  created.length = 0;
};

let snap: Awaited<ReturnType<typeof loadCatalogSnapshot>>;
let seq = 0;

// A running plan whose only delivery is on `lastTiffin`, so the renewal window is set by the test, not by the calendar.
async function plan(tag: string, lastTiffin: string): Promise<string> {
  const { publicId } = await createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { email: `renewal-next-${tag}${Date.now()}${seq++}@test.invalid`, fullName: `Renew ${tag}`, phone: `+1647557${String(1000 + seq).padStart(4, "0")}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  const [row] = await db.update(orders).set({ status: "active" }).where(eq(orders.publicId, publicId)).returning();
  await db.delete(deliveries).where(eq(deliveries.orderId, row.id));
  await db.insert(deliveries).values({ orderId: row.id, deliveryDate: lastTiffin, status: "scheduled", cutoffAt: Date.now() + DAY, tiffinUnits: 1 });
  created.push(row);
  return publicId;
}

describe("next renewal queue (integration)", () => {
  let p: Record<"overdue" | "due" | "renew" | "lapsed" | "closed" | "upcoming", string>;

  beforeAll(async () => {
    snap = await loadCatalogSnapshot();
    p = {
      overdue: await plan("overdue", iso(30)),
      due: await plan("due", iso(30)),
      renew: await plan("renew", iso(3)),
      lapsed: await plan("lapsed", iso(-5)),
      closed: await plan("closed", iso(3)),
      upcoming: await plan("upcoming", iso(3)),
    };
    await setTrackStatus(p.overdue, { status: "follow_up", nextFollowUpAt: dayStart - 2 * 3_600_000 });
    await setTrackStatus(p.due, { status: "follow_up", nextFollowUpAt: dayStart + 3_600_000 });
    await setTrackStatus(p.closed, { status: "renewed" });
    await setTrackStatus(p.upcoming, { status: "follow_up", nextFollowUpAt: dayEnd + 2 * DAY });
  });
  afterAll(cleanup);

  // A limit above any test queue, so the whole ranking comes back.
  const everything = () => recommendedRenewals(scope, today, day, 500);
  const ours = () => [p.overdue, p.due, p.renew, p.lapsed];

  it("ranks overdue, due, then renew with plans ending soon before lapsed ones", async () => {
    const mine = (await everything()).rows.map((r) => r.orderPublicId).filter((id) => ours().includes(id));
    expect(mine).toEqual(ours());
  });

  it("gives each row its reason", async () => {
    const { rows } = await everything();
    const reasonOf = (id: string) => rows.find((r) => r.orderPublicId === id)?.reason;
    expect([reasonOf(p.overdue), reasonOf(p.due), reasonOf(p.renew), reasonOf(p.lapsed)]).toEqual(["overdue", "due", "renew", "renew"]);
  });

  it("never returns a renewed plan or one whose follow-up is upcoming", async () => {
    const ids = (await everything()).rows.map((r) => r.orderPublicId);
    expect(ids).not.toContain(p.closed);
    expect(ids).not.toContain(p.upcoming);
  });

  it("returns the top rows of that ranking, with the total of every plan that has a reason", async () => {
    const all = await everything();
    const top = await recommendedRenewals(scope, today, day, 2);
    expect(top.rows.map((r) => r.orderPublicId)).toEqual(all.rows.slice(0, 2).map((r) => r.orderPublicId));
    expect(top.total).toBe(all.total);
    expect(all.total).toBeGreaterThanOrEqual(4);
  }, 60_000);
});
