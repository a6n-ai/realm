import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ne, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, walletLedger, notifications, notificationOutbox, organization, deliveryZones } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder, refundOrder, refundPaymentInTx, listOrdersPage } = await import("@/lib/services/orders.service");
const { buildAnalyticsScope } = await import("../scope");
const { revenueTotals, revenueBy, paymentsByStatus } = await import("../money");
const { countOrders, countCustomers, scopeToOrdersCondition, ordersDrillHref } = await import("../orders");
const { needsReviewRows } = await import("../needs-review");
const { eq, inArray } = await import("drizzle-orm");

const TZ = "America/Toronto";
// Toronto is on EDT (UTC-4) from Mar 8 2026, so 23:30 on Mar 31 is already Apr 1 in UTC.
const at = (iso: string) => Date.parse(iso);
const MARCH_NOW = at("2026-03-15T16:00:00Z");
const APRIL_NOW = at("2026-04-15T16:00:00Z");

async function wipe() {
  await db.delete(walletLedger);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  const customerIds = db.select({ id: users.id }).from(users).where(ne(users.isSystem, true));
  await db.delete(notificationOutbox).where(inArray(notificationOutbox.recipientId, customerIds));
  await db.delete(notifications).where(inArray(notifications.userId, customerIds));
  await db.delete(users).where(ne(users.isSystem, true));
}

const suffix = Math.random().toString(36).slice(2);
let orgA = "";
let orgB = "";
let zoneName = "";
let createdZoneId: bigint | null = null;
let mealKeyA = "";
const o: Record<string, string> = {};
let n = 0;

describe("analytics reconciliation (integration)", () => {
  beforeAll(async () => {
    await wipe();
    const snap = await loadCatalogSnapshot();
    mealKeyA = snap.mealSizes[0].key;
    [{ id: orgA }] = await db.insert(organization).values({ name: "Recon A", clientCode: `RA-${suffix}` }).returning({ id: organization.id });
    [{ id: orgB }] = await db.insert(organization).values({ name: "Recon B", clientCode: `RB-${suffix}` }).returning({ id: organization.id });
    const [zone] = await db.select({ id: deliveryZones.id, name: deliveryZones.name }).from(deliveryZones).limit(1);
    let zoneId = zone?.id;
    zoneName = zone?.name ?? `Recon zone ${suffix}`;
    if (!zoneId) {
      [{ id: zoneId }] = await db.insert(deliveryZones).values({ name: zoneName } as never).returning({ id: deliveryZones.id });
      createdZoneId = zoneId;
    }

    const make = async (key: string, org: string, over: { status?: "cancelled" | "active"; createdAt: number; total?: number; tax?: number; mealIdx?: number; zone?: boolean }) => {
      const k = n++;
      const input = {
        planKey: snap.plans[0].key,
        selections: {
          mealSizeId: snap.mealSizes[over.mealIdx ?? 0].publicId, frequencyKey: "5_day" as const, persons: 1, mealSlots: ["lunch"],
          includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
        },
        contact: { email: `r${k}${suffix}@test.invalid`, fullName: `Recon ${key}`, phone: `+1647555${String(7000 + k)}`, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
      };
      const { publicId } = await createOrder(input);
      o[key] = publicId;
      await db.update(orders).set({
        organizationId: org,
        status: over.status ?? "active",
        createdAt: over.createdAt,
        pricingSnapshot: { total: over.total ?? 113, taxTotal: over.tax ?? 13 },
        ...(over.zone ? { zoneId } : {}),
      }).where(eq(orders.publicId, publicId));
      // createOrder wrote its own payment and ledger rows; the test owns the money.
      const [row] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, publicId));
      await db.delete(ledgerEntries).where(eq(ledgerEntries.orderId, row.id));
      await db.delete(payments).where(eq(payments.orderId, row.id));
      return row.id;
    };
    const pay = async (orderId: bigint, amount: number, capturedAt: number | null, over: Partial<typeof payments.$inferInsert> = {}) => {
      const [p] = await db.insert(payments).values({
        orderId, amount: amount.toFixed(2), status: "paid", method: "stripe", capturedAt, createdAt: capturedAt ?? at("2026-03-15T00:00:00Z"), organizationId: null, ...over,
      } as never).returning({ id: payments.id });
      return p.id;
    };

    const mar = (d: number) => at(`2026-03-${String(d).padStart(2, "0")}T15:00:00Z`);
    const plain = await make("plain", orgA, { createdAt: mar(9), zone: true });
    await pay(plain, 113, mar(10));
    const coin = await make("coin", orgA, { createdAt: mar(10), mealIdx: 1 });
    await db.update(orders).set({ trialLength: 6 }).where(eq(orders.id, coin));
    await pay(coin, 90, mar(11));
    const cancelled = await make("cancelled", orgA, { status: "cancelled", createdAt: mar(11) });
    await pay(cancelled, 113, mar(12));
    const refunded = await make("refunded", orgA, { createdAt: mar(12) });
    await pay(refunded, 113, mar(13));
    const addon = await make("addon", orgA, { createdAt: mar(13), zone: true });
    await db.update(orders).set({ userId: (await db.select({ u: orders.userId }).from(orders).where(eq(orders.id, plain)))[0].u }).where(eq(orders.id, addon));
    await pay(addon, 113, mar(14));
    await pay(addon, 22.6, mar(14), { addonRequest: { taxTotal: 2.6, amountDue: 22.6 } as never });
    const unpaid = await make("unpaid", orgA, { createdAt: mar(14) });
    await pay(unpaid, 113, null, { status: "awaiting_payment" });
    // 23:30 Toronto on Mar 31 = Apr 1 03:30Z.
    const late = await make("late", orgA, { createdAt: at("2026-04-01T03:30:00Z") });
    await pay(late, 113, at("2026-04-01T03:30:00Z"));
    const stripe = await make("stripe", orgA, { createdAt: mar(15) });
    const stripePay = await pay(stripe, 113, mar(15), { surchargeAmount: "3.00" });
    const hold = await make("hold", orgA, { createdAt: at("2026-02-20T15:00:00Z") });
    await pay(hold, 113, mar(16));
    const other = await make("other", orgB, { createdAt: mar(10) });
    await pay(other, 113, mar(10));

    // Staff refund through the real path, then dated into April.
    await refundOrder(o.refunded);
    await db.update(ledgerEntries).set({ createdAt: at("2026-04-02T15:00:00Z") }).where(eq(ledgerEntries.orderId, refunded));
    // Stripe-style partial refund (includes surcharge), booked in March.
    const [stripeOrder] = await db.select({ userId: orders.userId }).from(orders).where(eq(orders.id, stripe));
    await db.insert(ledgerEntries).values({ userId: stripeOrder.userId!, orderId: stripe, paymentId: stripePay, direction: "debit", type: "refund", amount: "58.00", providerEventId: `evt-${suffix}-1`, createdAt: mar(20) } as never);
    // Stripe full refund followed by refundPaymentInTx(ledgerRecorded): still one ledger row.
    const [holdOrder] = await db.select({ userId: orders.userId, publicId: orders.publicId }).from(orders).where(eq(orders.id, hold));
    const [holdPay] = await db.select({ id: payments.id }).from(payments).where(eq(payments.orderId, hold));
    await db.insert(ledgerEntries).values({ userId: holdOrder.userId!, orderId: hold, paymentId: holdPay.id, direction: "debit", type: "refund", amount: "113.00", providerEventId: `evt-${suffix}-2`, createdAt: at("2026-04-03T15:00:00Z") } as never);
    await db.transaction((tx) => refundPaymentInTx(tx, { orderId: hold, orderPublicId: holdOrder.publicId, userId: holdOrder.userId, paymentId: holdPay.id, actorInternalId: null, note: "Stripe", ledgerRecorded: true }));
  });

  afterAll(async () => {
    await wipe();
    await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
    if (createdZoneId) await db.delete(deliveryZones).where(eq(deliveryZones.id, createdZoneId));
  });

  const scopeA = (now: number, extra: Record<string, string | undefined> = {}) => buildAnalyticsScope({ ...extra }, [orgA], TZ, now);

  // Independent of the helpers under test: plain SQL over payments / ledger_entries / orders.
  async function directRevenue(orgIds: string[], from: number, to: number) {
    const q = (rows: unknown) => (rows as { rows?: Record<string, string>[] }).rows ?? (rows as Record<string, string>[]);
    const ids = sql.join(orgIds.map((i) => sql`${i}`), sql`, `);
    const pay = q(await db.execute(sql`
      select coalesce(sum(p.amount * (1 - coalesce((case when p.addon_request is not null then p.addon_request->>'taxTotal' else o.pricing_snapshot->>'taxTotal' end)::numeric, 0)
        / nullif((case when p.addon_request is not null then p.addon_request->>'amountDue' else o.pricing_snapshot->>'total' end)::numeric, 0))), 0) as net,
        coalesce(sum(p.amount), 0) as gross
      from payments p join orders o on o.id = p.order_id
      where o.organization_id in (${ids}) and p.status in ('paid', 'simulated_paid', 'refunded')
        and coalesce(p.captured_at, p.created_at) between ${from} and ${to}`))[0];
    const ref = q(await db.execute(sql`
      select coalesce(sum(l.amount), 0) as refunds,
        coalesce(sum(l.amount * (p.amount / (p.amount + p.surcharge_amount)) * (1 - coalesce((case when p.addon_request is not null then p.addon_request->>'taxTotal' else o.pricing_snapshot->>'taxTotal' end)::numeric, 0)
        / nullif((case when p.addon_request is not null then p.addon_request->>'amountDue' else o.pricing_snapshot->>'total' end)::numeric, 0))), 0) as ex_tax
      from ledger_entries l join payments p on p.id = l.payment_id join orders o on o.id = p.order_id
      where l.type = 'refund' and o.organization_id in (${ids}) and l.created_at between ${from} and ${to}`))[0];
    return { gross: Number(pay.gross), net: Math.round((Number(pay.net) - Number(ref.ex_tax)) * 100) / 100, refunds: Number(ref.refunds), refundsExTax: Math.round(Number(ref.ex_tax) * 100) / 100 };
  }

  it("March revenue equals direct SQL; late-evening, add-on quote, and surcharge-aware refund are exact", async () => {
    const s = scopeA(MARCH_NOW);
    const t = await revenueTotals(s);
    const d = await directRevenue([orgA], s.fromMs, s.toMs);
    expect(t.gross).toBe(d.gross);
    expect(t.net).toBe(d.net);
    expect(t.refunds).toBe(d.refunds);
    expect(t.refundsExTax).toBe(d.refundsExTax);
    // Captured Mar: plain, coin, cancelled, refunded, addon (plan + add-on), late, stripe, hold = 9 payments; unpaid and org B excluded.
    expect(t.payments).toBe(9);
    // Stripe refund 58.00 on a 113.00 + 3.00 surcharge payment: 58 x 113/116 x (100/113) = 50.00 ex tax, ex surcharge.
    expect(t.refundsExTax).toBe(50);
    expect(t.refunds).toBe(58);
    expect(t.surcharge).toBe(3);
    // 7 x 100 (plain, cancelled-but-kept, refunded, addon plan, late, stripe, hold) + 79.65 coin + 20 add-on - 50 refund
    expect(t.net).toBe(749.65);
    expect(t.unlinkedRefunds).toBe(0);
  });

  it("the staff refund lands in the refund's month, not the payment's", async () => {
    const s = scopeA(APRIL_NOW);
    const t = await revenueTotals(s);
    const d = await directRevenue([orgA], s.fromMs, s.toMs);
    expect(t.net).toBe(d.net);
    // Apr: staff refund 113 (net 100) + Stripe full refund 113 (net 100); no April payments are captured except none.
    expect(t.refundsExTax).toBe(200);
    expect(t.refunds).toBe(226);
  });

  it("franchise scope: B is absent from A and present under all", async () => {
    const s = scopeA(MARCH_NOW);
    const all = buildAnalyticsScope({}, "all", TZ, MARCH_NOW);
    const b = buildAnalyticsScope({}, [orgB], TZ, MARCH_NOW);
    expect((await revenueTotals(all)).gross).toBe((await revenueTotals(s)).gross + (await revenueTotals(b)).gross);
    expect((await revenueTotals(b)).gross).toBe(113);
    expect(await revenueTotals(buildAnalyticsScope({}, [], TZ, MARCH_NOW))).toMatchObject({ gross: 0, net: 0, payments: 0 });
  });

  it("the late-evening order is dated into March by the Toronto day", async () => {
    const days = await revenueBy(scopeA(MARCH_NOW), "day");
    expect(days.find((x) => x.key === "2026-03-31")?.net).toBe(100);
    expect(days.find((x) => x.key === "2026-04-01")).toBeUndefined();
  });

  it("revenueBy buckets sum to the totals for every dimension", async () => {
    const s = scopeA(MARCH_NOW);
    const t = await revenueTotals(s);
    for (const dim of ["day", "method", "plan", "mealSize", "cohort"] as const) {
      const rows = await revenueBy(s, dim);
      expect(Math.round(rows.reduce((a, r) => a + r.net, 0) * 100) / 100).toBe(t.net);
    }
    const cohort = Object.fromEntries((await revenueBy(s, "cohort")).map((r) => [r.key, r.net]));
    expect(cohort.trial).toBe(79.65);
    expect(cohort.renewal).toBe(120);
  });

  it("paymentsByStatus uses the money date and covers every status", async () => {
    const rows = Object.fromEntries((await paymentsByStatus(scopeA(MARCH_NOW))).map((r) => [r.status, r]));
    expect(rows.awaiting_payment).toMatchObject({ count: 1, amount: 113 });
    expect(rows.paid.count).toBe(7);
    expect(rows.refunded.count).toBe(2);
  });

  it("order counts equal the Orders listing total for each status and with facets", async () => {
    const s = scopeA(MARCH_NOW);
    for (const status of ["active", "cancelled", "pending", "completed"]) {
      const total = (await listOrdersPage(scopeToOrdersCondition(s, { status: [status] }), { page: 0, size: 1 }, undefined, s.orgIds)).total;
      expect(await countOrders(s, { status: [status] })).toBe(total);
    }
    expect(await countOrders(s, { status: ["active"] })).toBe(7);
    const faceted = scopeA(MARCH_NOW, { zone: zoneName, mealSize: mealKeyA });
    const total = (await listOrdersPage(scopeToOrdersCondition(faceted), { page: 0, size: 1 }, undefined, faceted.orgIds)).total;
    expect(await countOrders(faceted)).toBe(total);
    expect(total).toBe(2);
    expect(await countCustomers(s)).toBe(7);
    expect(await countCustomers(faceted)).toBe(1);
    expect(ordersDrillHref(faceted, { status: ["active"] })).toContain("zone=");
  });

  it("needs review is exactly the cancelled-but-paid and coin-reduced orders", async () => {
    const rows = await needsReviewRows(scopeA(MARCH_NOW));
    expect(rows.map((r) => r.orderPublicId).sort()).toEqual([o.cancelled, o.coin].sort());
    const c = rows.find((r) => r.orderPublicId === o.cancelled)!;
    const k = rows.find((r) => r.orderPublicId === o.coin)!;
    expect(c).toMatchObject({ reasons: ["cancelled_paid"], paid: 113, total: 113, diff: 0 });
    expect(k).toMatchObject({ reasons: ["paid_ne_total"], paid: 90, total: 113, diff: -23 });
  });

  it("each refund path writes exactly one ledger refund row", async () => {
    const count = async (publicId: string) => {
      const [r] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, publicId));
      return (await db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, r.id))).filter((l) => l.type === "refund").length;
    };
    expect(await count(o.refunded)).toBe(1);
    expect(await count(o.hold)).toBe(1);
  });
});
