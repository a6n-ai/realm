import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@foundry/places", async (orig) => ({ ...(await orig<object>()), resolveAndPersist: async () => null }));
const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../create-order");
const { nextOrder, upNextOrders, orderQueueCount } = await import("../next-order.service");
const DAY = 86_400_000;
const iso = (offsetDays: number) => new Date(Date.now() + offsetDays * DAY).toISOString().slice(0, 10);
const scope = { visible: "all" as const };
const today = iso(0);
type Reason = "verify" | "overdue" | "missed" | "flagged" | "pending";
const created: (typeof orders.$inferSelect)[] = [];
const cleanup = async () => {
  if (created.length === 0) return;
  const ids = created.map((o) => o.id);
  const userIds = created.map((o) => o.userId).filter((id): id is bigint => id != null);
  await db.delete(deliveries).where(inArray(deliveries.orderId, ids));
  await db.delete(orderActivities).where(inArray(orderActivities.orderId, ids));
  await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, ids));
  await db.delete(payments).where(inArray(payments.orderId, ids));
  await db.delete(orders).where(inArray(orders.id, ids));
  if (userIds.length) await db.delete(users).where(inArray(users.id, userIds));
  created.length = 0;
};
describe("next order queue (integration)", () => {
  const rows: Partial<Record<Reason | "none", typeof orders.$inferSelect>> = {};
  let snap: Awaited<ReturnType<typeof loadCatalogSnapshot>>;
  async function makeOrder(tag: string) {
    const { publicId } = await createOrder({
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
        includeSaturday: false, includeSunday: false, durationWeeks: 1,
        startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
      },
      contact: { email: `next-${tag}${Math.random().toString(36).slice(2)}@test.invalid`, fullName: `Next ${tag}`, phone: `+1647556${String(Math.floor(Math.random() * 10000)).padStart(4, "0")}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    const [row] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    created.push(row);
    await db.delete(deliveries).where(eq(deliveries.orderId, row.id));
    await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, row.id));
    await db.delete(payments).where(eq(payments.orderId, row.id));
    return row;
  }
  beforeAll(async () => {
    snap = await loadCatalogSnapshot();
    for (const tag of ["verify", "overdue", "missed", "flagged", "pending", "none"] as const) rows[tag] = await makeOrder(tag);
    await db.insert(payments).values({ orderId: rows.verify!.id, amount: "40.00", status: "pending_verification" });
    await db.insert(payments).values({ orderId: rows.overdue!.id, amount: "41.00", status: "awaiting_payment", createdAt: Date.now() - 4 * DAY });
    await db.insert(payments).values({ orderId: rows.pending!.id, amount: "42.00", status: "awaiting_payment" });
    await db.update(orders).set({ status: "active" }).where(eq(orders.id, rows.missed!.id));
    await db.insert(deliveries).values({ orderId: rows.missed!.id, deliveryDate: iso(-3), status: "scheduled", cutoffAt: Date.now() - DAY, tiffinUnits: 1 });
    await db.update(orders).set({ lookOutAt: Date.now() }).where(eq(orders.id, rows.flagged!.id));
  });
  afterAll(cleanup);
  // Walks the whole queue from the top, Next at a time, and stops when it wraps back to the first row.
  async function walk() {
    const first = await nextOrder(scope, today);
    if (!first) return [];
    const out = [first];
    for (let i = 0; i < 500; i++) {
      const n = await nextOrder(scope, today, { publicId: out[out.length - 1].publicId, dir: "next" });
      if (!n || n.publicId === first.publicId) break;
      out.push(n);
    }
    return out;
  }
  const ours = () => [rows.verify!, rows.overdue!, rows.missed!, rows.flagged!, rows.pending!].map((r) => r.publicId);
  it("walks the queue in ranking order: verify, overdue, missed, flagged, pending", async () => {
    const mine = (await walk()).map((r) => r.publicId).filter((id) => ours().includes(id));
    expect(mine).toEqual(ours());
  });
  it("never returns an order with no reason", async () => {
    expect((await walk()).map((r) => r.publicId)).not.toContain(rows.none!.publicId);
  });
  it("payment reasons carry the payment publicId and amount", async () => {
    const verify = (await walk()).find((r) => r.publicId === rows.verify!.publicId);
    expect(verify).toMatchObject({ reason: "verify", amount: 40 });
    const [p] = await db.select({ publicId: payments.publicId }).from(payments).where(eq(payments.orderId, rows.verify!.id));
    expect(verify?.paymentPublicId).toBe(p.publicId);
    const missed = (await walk()).find((r) => r.publicId === rows.missed!.publicId);
    expect(missed).toMatchObject({ reason: "missed", paymentPublicId: null, amount: null });
  });
  it("upNext returns the next rows in walk order, wrapping at the end", async () => {
    const all = (await walk()).map((r) => r.publicId);
    const at = all.indexOf(rows.pending!.publicId);
    const expected = [1, 2, 3].map((k) => all[(at + k) % all.length]);
    expect((await upNextOrders(scope, today, rows.pending!.publicId, 3)).map((r) => r.publicId)).toEqual(expected);
  });
  it("counts every order that has a reason", async () => {
    expect(await orderQueueCount(scope, today)).toBeGreaterThanOrEqual(5);
  });
});
