import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { dayRange } from "@foundry/commons/util/dates";
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@foundry/places", async (orig) => ({ ...(await orig<object>()), resolveAndPersist: async () => null }));
const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, renewalActivities, renewals, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../create-order");
const { setTrackStatus } = await import("../renewal-tracking.service");
const { nextRenewal, upNextRenewals, renewalQueueCount } = await import("../next-renewal.service");
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
  await db.delete(renewalActivities).where(inArray(renewalActivities.renewalId, db.select({ id: renewals.id }).from(renewals).where(inArray(renewals.orderId, ids))));
  await db.delete(renewals).where(inArray(renewals.orderId, ids));
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

  // Walks the whole queue from the top, Next at a time, and stops when it wraps back to the first row.
  async function walk() {
    const first = await nextRenewal(scope, today, day);
    if (!first) return [];
    const out = [first];
    for (let i = 0; i < 500; i++) {
      const n = await nextRenewal(scope, today, day, { publicId: out[out.length - 1].orderPublicId, dir: "next" });
      if (!n || n.orderPublicId === first.orderPublicId) break;
      out.push(n);
    }
    return out;
  }
  const ours = () => [p.overdue, p.due, p.renew, p.lapsed];

  it("walks overdue, due, then to renew with plans ending soon before lapsed ones", async () => {
    const mine = (await walk()).map((r) => r.orderPublicId).filter((id) => ours().includes(id));
    expect(mine).toEqual(ours());
  });

  it("gives each row its reason", async () => {
    const all = await walk();
    const reasonOf = (id: string) => all.find((r) => r.orderPublicId === id)?.reason;
    expect([reasonOf(p.overdue), reasonOf(p.due), reasonOf(p.renew), reasonOf(p.lapsed)]).toEqual(["overdue", "due", "renew", "renew"]);
  });

  it("never returns a renewed plan or one whose follow-up is upcoming", async () => {
    const ids = (await walk()).map((r) => r.orderPublicId);
    expect(ids).not.toContain(p.closed);
    expect(ids).not.toContain(p.upcoming);
  });

  it("upNext returns the next rows in walk order, wrapping at the end", async () => {
    const all = (await walk()).map((r) => r.orderPublicId);
    const upNextOf = async (id: string) => (await upNextRenewals(scope, today, day, id, 3)).map((r) => r.orderPublicId);
    const at = all.indexOf(p.renew);
    expect(await upNextOf(p.renew)).toEqual([1, 2, 3].map((k) => all[(at + k) % all.length]));
    expect(await upNextOf(all[all.length - 1])).toEqual(all.slice(0, 3));
  }, 60_000);

  it("counts every plan that has a reason", async () => {
    expect(await renewalQueueCount(scope, today, day)).toBeGreaterThanOrEqual(4);
  });
});
