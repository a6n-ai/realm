import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deleteNonSystemUsers } = await import("@/db/test-helpers");
const { orders, payments, orderActivities, ledgerEntries, deliveries, subscriptionPauses } = await import("@/db/schema");
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
  await deleteNonSystemUsers();
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
    contact: { email: `u${Math.random().toString(36).slice(2)}@test.invalid`,  fullName: "Jane", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
  return publicId;
}

async function orderIdOf(publicId: string): Promise<bigint> {
  const [o] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, publicId));
  return o.id;
}

describe("autoResumeIfElapsed + one-open-pause index (integration)", () => {
  beforeEach(reset);
  afterAll(reset);

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
    expect(layers.some((l) => l.code === "23505" && (l.constraint ?? l.constraint_name ?? "").includes("subscription_pauses_one_open_unique"))).toBe(true);
  });

  it("autoResumeIfElapsed flips a fully-paused order whose open pause is elapsed back to active", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    // Pause a window fully in the past relative to "today" so untilDate < today.
    await db.insert(subscriptionPauses).values({ orderId, fromDate: "2000-01-01", untilDate: "2000-01-02", isIndefinite: false });
    await db.update(orders).set({ status: "paused" }).where(eq(orders.id, orderId));

    await autoResumeIfElapsed(orderId);

    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("active");
    const [pauseRow] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(pauseRow.resumedAt).not.toBeNull();
  });

  it("autoResumeIfElapsed leaves an indefinite pause window open, but retires the paused order status", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    await db.insert(subscriptionPauses).values({ orderId, fromDate: "2000-01-01", untilDate: "2000-01-01", isIndefinite: true });
    await db.update(orders).set({ status: "paused" }).where(eq(orders.id, orderId));
    await autoResumeIfElapsed(orderId);
    const [o] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(o.status).toBe("active");
    const [pauseRow] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(pauseRow.resumedAt).toBeNull();
  });

  it("autoResumeIfElapsed closes an elapsed PARTIAL-pause row without a status flip, so a fresh pause is legal again", async () => {
    const publicId = await makeOrder();
    const orderId = await orderIdOf(publicId);
    // A window in the past covers no future delivery, so the order stays "active" while the
    // recorded pause row stays open — the common "partial pause" shape the bug report describes.
    await db.insert(subscriptionPauses).values({ orderId, fromDate: "2000-01-01", untilDate: "2000-01-02", isIndefinite: false });
    const [before] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(before.status).toBe("active");

    await autoResumeIfElapsed(orderId);

    const [pauseRow] = await db.select().from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId));
    expect(pauseRow.resumedAt).not.toBeNull();
    const [after] = await db.select().from(orders).where(eq(orders.id, orderId));
    expect(after.status).toBe("active"); // never flipped — there was nothing to resume

    // The one-open-pause guard has released: a new pause no longer throws "already paused".
    await expect(db.insert(subscriptionPauses).values({ orderId, fromDate: "2000-01-03", untilDate: "2000-01-04", isIndefinite: false })).resolves.toBeDefined();
  });
});
