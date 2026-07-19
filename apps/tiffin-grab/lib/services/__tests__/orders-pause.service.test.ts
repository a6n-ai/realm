import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq, isNull, ne } from "drizzle-orm";
import { nextWeekday } from "@realm/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, deliveries, subscriptionPauses } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const svc = await import("../orders.service");
const { autoResumeIfElapsed } = await import("../orders.service");

async function reset() {
  await db.delete(subscriptionPauses);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(deliveries);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function makeOrder(): Promise<string> {
  const snap = await loadCatalogSnapshot();
  const { publicId } = await svc.createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
      includeSaturday: false, includeSunday: false, durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    contact: { fullName: "Jane", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  return publicId;
}

async function orderIdOf(publicId: string): Promise<bigint> {
  const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, publicId));
  return o.id;
}

describe("OrdersService.pause/resume — limits + recorded pauses (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

  it("records exactly one subscription_pauses row with matching from/until", async () => {
    const publicId = await makeOrder();
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2100-01-01" });
    const orderId = await orderIdOf(publicId);
    const rows = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(rows).toHaveLength(1);
    expect(rows[0].fromDate).toBe("2000-01-01");
    expect(rows[0].untilDate).toBe("2100-01-01");
    expect(rows[0].isIndefinite).toBe(false);
    expect(rows[0].resumedAt).toBeNull();
  });

  // DEFECT 1 (TOCTOU): assertPauseAllowed + the subscriptionPauses insert run with no lock, so two
  // concurrent pauseMySubscription calls can both pass the app-level check. The DB-level backstop is
  // the partial UNIQUE index on (order_id) WHERE resumed_at IS NULL — a second OPEN row for the same
  // order must be physically impossible, independent of any app-level race.
  it("a second direct insert of an OPEN pause row for the same order violates the unique index", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    await db.insert(subscriptionPauses).values({
      orderId, fromDate: "2000-01-01", untilDate: "2100-01-01", isIndefinite: false,
    });
    let caught: unknown;
    try {
      await db.insert(subscriptionPauses).values({
        orderId, fromDate: "2000-02-01", untilDate: "2100-02-01", isIndefinite: false,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeDefined();
    type PgErr = { code?: string; constraint?: string; constraint_name?: string; cause?: PgErr };
    const err = caught as PgErr;
    const layers = [err, err?.cause, err?.cause?.cause].filter(Boolean) as PgErr[];
    expect(layers.some((l) => l.code === "23505" && (l.constraint ?? l.constraint_name ?? "").includes("subscription_pauses_one_open_uniq"))).toBe(true);
  });

  it("pauseOrder throws 'already paused' when the unique index rejects a concurrent-winner's open row", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    // Simulate the losing side of a race: an OPEN pause row already exists (as if a concurrent
    // request won), inserted directly so assertPauseAllowed's own DB read also sees it — this
    // exercises the ValidationError mapping at the insert site, and the fast-path guard together.
    await db.insert(subscriptionPauses).values({
      orderId, fromDate: "2000-01-01", untilDate: "2100-01-01", isIndefinite: false,
    });
    await expect(svc.pauseOrder(publicId, { from: "2000-02-01", until: "2100-02-01" })).rejects.toThrow("already paused");
  });

  it("throws 'already paused' on a second overlapping pause while one is open", async () => {
    const publicId = await makeOrder();
    // A window in the past covers no future delivery, so the order stays "active" (per the
    // existing narrower-window behavior) while the pause row it records stays open — exercising
    // the one-open-pause guard independent of the order-status guard.
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2000-01-02" });
    const orderId = await orderIdOf(publicId);
    const [order] = await db.select({ status: orders.status }).from(orders).where(eq(orders.id, orderId));
    expect(order.status).toBe("active");
    await expect(svc.pauseOrder(publicId, { from: "2000-01-03", until: "2000-01-04" })).rejects.toThrow("already paused");
  });

  // DEFECT 2: autoResumeIfElapsed runs on the read path with no lock, so two concurrent renders can
  // each observe status="paused" and each call resume(), each inserting a duplicate "resumed"
  // activity. resume()'s status flip is now a CONDITIONAL update (WHERE status='paused') — only the
  // call that actually flips the row proceeds to log the activity; a second call against an
  // already-active order is a no-op.
  it("a normal pause -> resume logs exactly ONE 'resumed' activity", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2100-01-01" });
    await svc.resumeOrder(publicId);
    const acts = await svc.listOrderActivities(orderId);
    expect(acts.filter((a) => a.type === "resumed")).toHaveLength(1);
  });

  it("resume() on an order that is already active is a no-op and does not insert a duplicate 'resumed' activity", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2100-01-01" });
    await svc.resumeOrder(publicId);
    // Order is now active; simulate the losing side of a concurrent-resume race directly against
    // the conditional-update SQL path rather than through the public API's status guard.
    const { orders } = await import("@/db/schema");
    const { and, eq } = await import("drizzle-orm");
    const flipped = await db.update(orders)
      .set({ status: "active" })
      .where(and(eq(orders.publicId, publicId), eq(orders.status, "paused")))
      .returning({ id: orders.id });
    expect(flipped).toHaveLength(0);
    const acts = await svc.listOrderActivities(orderId);
    expect(acts.filter((a) => a.type === "resumed")).toHaveLength(1);
  });

  it("resume stamps resumedAt and a subsequent pause is allowed again", async () => {
    const publicId = await makeOrder();
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2100-01-01" });
    const orderId = await orderIdOf(publicId);
    await svc.resumeOrder(publicId);

    const [closed] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(closed.resumedAt).not.toBeNull();

    // Order is active again after resume, so a fresh pause is legal.
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2100-01-01" });
    const rows = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(rows).toHaveLength(2);
    const open = rows.filter((r) => r.resumedAt == null);
    expect(open).toHaveLength(1);
  });

  it("indefinite pause sets untilDate to last delivery date, isIndefinite=true, and flips order to paused", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    const lastDelivery = await db.select({ d: deliveries.deliveryDate }).from(deliveries)
      .where(eq(deliveries.orderId, orderId)).orderBy(deliveries.deliveryDate);
    const expectedLast = lastDelivery[lastDelivery.length - 1].d;

    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2000-01-01", indefinite: true });

    const [row] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(row.isIndefinite).toBe(true);
    expect(row.untilDate).toBe(expectedLast);
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("paused");
  });

  it("autoResumeIfElapsed flips a fully-paused order whose open pause is elapsed back to active", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    // Pause a window fully in the past relative to "today" so untilDate < today.
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2000-01-02" });
    // Force the order into "paused" and the pause row's untilDate into the past
    // directly — pauseRange only pauses future rows, so simulate the elapsed state.
    await db.update(orders).set({ status: "paused" }).where(eq(orders.id, orderId));
    await db.update(subscriptionPauses)
      .set({ untilDate: "2000-01-02" })
      .where(and(eq(subscriptionPauses.orderId, orderId), isNull(subscriptionPauses.resumedAt)));

    await autoResumeIfElapsed(orderId);

    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("active");
    const [pauseRow] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(pauseRow.resumedAt).not.toBeNull();
  });

  it("autoResumeIfElapsed leaves an indefinite pause untouched", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2000-01-01", indefinite: true });
    await autoResumeIfElapsed(orderId);
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("paused");
  });

  it("autoResumeIfElapsed closes an elapsed PARTIAL-pause row without a status flip, so a fresh pause is legal again", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    // A window in the past covers no future delivery, so the order stays "active" while the
    // recorded pause row stays open — the common "partial pause" shape the bug report describes.
    await svc.pauseOrder(publicId, { from: "2000-01-01", until: "2000-01-02" });
    const [before] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(before.status).toBe("active");

    await autoResumeIfElapsed(orderId);

    const [pauseRow] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(pauseRow.resumedAt).not.toBeNull();
    const [after] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(after.status).toBe("active"); // never flipped — there was nothing to resume

    // The one-open-pause guard has released: a new pause no longer throws "already paused".
    await expect(svc.pauseOrder(publicId, { from: "2000-01-03", until: "2000-01-04" })).resolves.toBeUndefined();
  });
});
