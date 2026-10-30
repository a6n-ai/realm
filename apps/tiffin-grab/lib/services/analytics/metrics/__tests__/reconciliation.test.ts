import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { ne, sql } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
// recordStripeRefund (the real webhook path) imports the Stripe runtime; it is never called here.
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({ stripe: {}, cfg: { surcharge: { enabled: false, ratePct: 0, excludeProvinces: [], networksNotifiedOn: "2026-09-01" }, tax: { enabled: false, taxCode: "txcd_x", surchargeTaxable: false } } }),
}));

const { db } = await import("@/db/client");
const { orders, payments, orderActivities, ledgerEntries, users, walletLedger, notifications, notificationOutbox, organization, deliveryZones } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { nextWeekday } = await import("@foundry/commons");
const { createOrder, refundOrder, listOrdersPage } = await import("@/lib/services/orders.service");
const { buildAnalyticsScope } = await import("../scope");
const { revenueTotals, revenueBy, paymentsByStatus } = await import("../money");
const { countOrders, countCustomers, scopeToOrdersCondition, ordersDrillHref } = await import("../orders");
const { needsReviewRows } = await import("../needs-review");
const { recordStripeRefund } = await import("@/lib/services/payment-stripe");
const { buildOrdersSpec } = await import("@/app/(dashboard)/dashboard/orders/orders-spec");
const { parseFilterState } = await import("@/components/ds");
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

    const make = async (key: string, org: string, over: { status?: "cancelled" | "active"; createdAt: number; total?: number; tax?: number; applied?: object; mealIdx?: number; zone?: boolean }) => {
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
        pricingSnapshot: { total: over.total ?? 113, taxTotal: over.tax ?? 13, ...(over.applied ? { appliedAddons: over.applied } : {}) },
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
    // applyAddons leaves the snapshot including the add-on: plan 113 (13 tax, 13%) + add-on 20 (1 tax, 5%).
    const addon = await make("addon", orgA, { createdAt: mar(13), zone: true, total: 133, tax: 14, applied: { addonSubtotal: 19, taxTotal: 1, amountDue: 20 } });
    await db.update(orders).set({ userId: (await db.select({ u: orders.userId }).from(orders).where(eq(orders.id, plain)))[0].u }).where(eq(orders.id, addon));
    await pay(addon, 113, mar(14));
    await pay(addon, 20, mar(14), { addonRequest: { taxTotal: 1, amountDue: 20 } as never });
    const unpaid = await make("unpaid", orgA, { createdAt: mar(14) });
    await pay(unpaid, 113, null, { status: "awaiting_payment" });
    // 23:30 Toronto on Mar 31 = Apr 1 03:30Z.
    const late = await make("late", orgA, { createdAt: at("2026-04-01T03:30:00Z") });
    await pay(late, 113, at("2026-04-01T03:30:00Z"));
    const stripe = await make("stripe", orgA, { createdAt: mar(15) });
    await pay(stripe, 113, mar(15), { surchargeAmount: "3.00", providerRef: "pi_recon_stripe" });
    const hold = await make("hold", orgA, { createdAt: at("2026-02-20T15:00:00Z") });
    await pay(hold, 113, mar(16), { providerRef: "pi_recon_hold" });
    // Marked refunded before the ledger wrote refund rows.
    const legacy = await make("legacy", orgA, { createdAt: mar(16) });
    await pay(legacy, 113, mar(17), { status: "refunded" });
    const surf = await make("surf", orgA, { createdAt: mar(17) });
    await pay(surf, 113, mar(18), { surchargeAmount: "3.00" });
    const other = await make("other", orgB, { createdAt: mar(10) });
    await pay(other, 113, mar(10));

    // Staff refunds through the real path, dated into April. The surcharged one writes amount + surcharge.
    await refundOrder(o.refunded);
    await refundOrder(o.surf);
    await db.update(ledgerEntries).set({ createdAt: at("2026-04-02T15:00:00Z") }).where(inArray(ledgerEntries.orderId, [refunded, surf]));
    // Stripe webhook path: partial refund (incl. surcharge share) in March, full refund in April.
    await recordStripeRefund({ piId: "pi_recon_stripe", eventId: `evt-${suffix}-1`, amountRefundedCents: 5800, fullyRefunded: false });
    await db.update(ledgerEntries).set({ createdAt: mar(20) }).where(eq(ledgerEntries.orderId, stripe));
    await recordStripeRefund({ piId: "pi_recon_hold", eventId: `evt-${suffix}-2`, amountRefundedCents: 11300, fullyRefunded: true });
    await db.update(ledgerEntries).set({ createdAt: at("2026-04-03T15:00:00Z") }).where(eq(ledgerEntries.orderId, hold));
  });

  afterAll(async () => {
    await wipe();
    await db.delete(organization).where(inArray(organization.id, [orgA, orgB]));
    if (createdZoneId) await db.delete(deliveryZones).where(eq(deliveryZones.id, createdZoneId));
  });

  const scopeA = (now: number, extra: Record<string, string | undefined> = {}) => buildAnalyticsScope({ ...extra }, [orgA], TZ, now);

  // Independent of the helpers under test: plain SQL over payments / ledger_entries / orders.
  const ADD = (k: string) => sql.raw(`(select coalesce(sum((a.addon_request->>'${k}')::numeric), 0) from payments a where a.order_id = p.order_id and a.addon_request is not null and a.status in ('paid', 'simulated_paid', 'refunded'))`);
  const TAX = sql`(case when p.addon_request is not null then (p.addon_request->>'taxTotal')::numeric else (o.pricing_snapshot->>'taxTotal')::numeric - ${ADD("taxTotal")} end)`;
  const TOT = sql`(case when p.addon_request is not null then (p.addon_request->>'amountDue')::numeric else (o.pricing_snapshot->>'total')::numeric - ${ADD("amountDue")} end)`;
  async function directRevenue(orgIds: string[], from: number, to: number) {
    const q = (rows: unknown) => (rows as { rows?: Record<string, string>[] }).rows ?? (rows as Record<string, string>[]);
    const ids = sql.join(orgIds.map((i) => sql`${i}`), sql`, `);
    const pay = q(await db.execute(sql`
      select coalesce(sum(p.amount * (1 - coalesce(${TAX}, 0) / nullif(${TOT}, 0))), 0) as net,
        coalesce(sum(p.amount), 0) as gross
      from payments p join orders o on o.id = p.order_id
      where o.organization_id in (${ids}) and p.status in ('paid', 'simulated_paid', 'refunded')
        and coalesce(p.captured_at, p.created_at) between ${from} and ${to}`))[0];
    const ref = q(await db.execute(sql`
      select coalesce(sum(l.amount), 0) as refunds,
        coalesce(sum(l.amount * (p.amount / (p.amount + p.surcharge_amount)) * (1 - coalesce(${TAX}, 0) / nullif(${TOT}, 0))), 0) as ex_tax
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
    // Captured Mar: plain, coin, cancelled, refunded, addon plan + add-on, late, stripe, hold, legacy, surf = 11; unpaid and org B excluded.
    expect(t.payments).toBe(11);
    // Stripe refund 58.00 on a 113.00 + 3.00 surcharge payment: 58 x 113/116 x (100/113) = 50.00 ex tax, ex surcharge.
    expect(t.refunds).toBe(58);
    expect(t.refundsExTax).toBe(50);
    expect(t.surcharge).toBe(6);
    // 9 x 100 (plain, cancelled-but-kept, refunded, addon plan, late, stripe, hold, legacy, surf) + 79.65 coin + 19 add-on (5%) - 50 refund
    expect(t.net).toBe(948.65);
    // Tax still held: 9 x 13 + 10.35 coin + 1 add-on - 6.50 on the refunded share
    expect(t.tax).toBe(121.85);
    expect(t.refundedWithoutLedger).toBe(1);
    expect(t.unlinkedRefunds).toBe(0);
  });

  it("refunds land in the refund's month; a late-March payment is not an April payment", async () => {
    const s = scopeA(APRIL_NOW);
    const t = await revenueTotals(s);
    const d = await directRevenue([orgA], s.fromMs, s.toMs);
    expect(t.net).toBe(d.net);
    expect(t.payments).toBe(0);
    expect(t.gross).toBe(0);
    // Staff 113 (100 ex tax) + Stripe full 113 (100) + surcharged staff refund 116 (100: 116 x 113/116 x 100/113).
    expect(t.refunds).toBe(342);
    expect(t.refundsExTax).toBe(300);
    expect(t.net).toBe(-300);
  });

  it("franchise scope: B is absent from A and present under all", async () => {
    const s = scopeA(MARCH_NOW);
    const all = buildAnalyticsScope({}, "all", TZ, MARCH_NOW);
    const b = buildAnalyticsScope({}, [orgB], TZ, MARCH_NOW);
    expect((await revenueTotals(all)).gross).toBe(Math.round(((await revenueTotals(s)).gross + (await revenueTotals(b)).gross) * 100) / 100);
    expect((await revenueTotals(b)).gross).toBe(113);
    expect(await revenueTotals(buildAnalyticsScope({}, [], TZ, MARCH_NOW))).toMatchObject({ gross: 0, net: 0, payments: 0 });
  });

  it("the late-evening order is dated into March by the Toronto day", async () => {
    const days = await revenueBy(scopeA(MARCH_NOW), "day");
    expect(days.find((x) => x.key === "2026-03-31")?.net).toBe(100);
    expect(days.find((x) => x.key === "2026-04-01")).toBeUndefined();
  });

  it("revenueBy buckets sum to the totals for every dimension; cohorts and the add-on's own quote are exact", async () => {
    const s = scopeA(MARCH_NOW);
    const t = await revenueTotals(s);
    for (const dim of ["day", "method", "plan", "mealSize", "cohort"] as const) {
      const rows = await revenueBy(s, dim);
      expect(Math.round(rows.reduce((a, r) => a + r.net, 0) * 100) / 100).toBe(t.net);
    }
    const cohort = Object.fromEntries((await revenueBy(s, "cohort")).map((r) => [r.key, r.net]));
    expect(cohort.trial).toBe(79.65);
    // The add-on order (a repeat customer): plan 100 at 13% stays 100 after the add-on, plus 19 for the 5% add-on.
    expect(cohort.renewal).toBe(119);
  });

  it("paymentsByStatus uses the money date and covers every status", async () => {
    const rows = Object.fromEntries((await paymentsByStatus(scopeA(MARCH_NOW))).map((r) => [r.status, r]));
    expect(rows.awaiting_payment).toMatchObject({ count: 1, amount: 113 });
    expect(rows.paid.count).toBe(7);
    expect(rows.refunded.count).toBe(4);
  });

  it("order counts equal the Orders listing total for each status and with facets", async () => {
    const s = scopeA(MARCH_NOW);
    for (const status of ["active", "cancelled", "pending", "completed"]) {
      const total = (await listOrdersPage(scopeToOrdersCondition(s, { status: [status] }), { page: 0, size: 1 }, undefined, s.orgIds)).total;
      expect(await countOrders(s, { status: [status] })).toBe(total);
    }
    expect(await countOrders(s, { status: ["active"] })).toBe(9);
    expect(await countCustomers(s)).toBe(9);
    const faceted = scopeA(MARCH_NOW, { zone: zoneName, mealSize: mealKeyA });
    expect(await countOrders(faceted)).toBe(2);
    expect(await countCustomers(faceted)).toBe(1);
  });

  it("a drill link round-trips through the Orders facet spec to the same total", async () => {
    const spec = buildOrdersSpec({
      planOptions: [], sizeOptions: [], zoneOptions: [],
      orgOptions: [{ value: orgA, label: "A" }, { value: orgB, label: "B" }],
    });
    const snap = await loadCatalogSnapshot();
    const cases = [
      { scope: scopeA(MARCH_NOW, { zone: zoneName, mealSize: mealKeyA }), extra: { status: ["active"] }, visible: [orgA, orgB] },
      { scope: scopeA(MARCH_NOW, { mealSize: snap.mealSizes.slice(0, 2).map((m) => m.key).join(",") }), extra: {}, visible: [orgA] },
      { scope: buildAnalyticsScope({ org: `${orgA},${orgB}` }, "all", TZ, MARCH_NOW), extra: {}, visible: "all" as const },
    ];
    for (const c of cases) {
      const href = ordersDrillHref(c.scope, c.extra, c.visible);
      const sp = Object.fromEntries(new URL(href, "http://x").searchParams);
      const { condition, page } = parseFilterState(spec, sp);
      const listed = await listOrdersPage(condition, page, undefined, c.visible);
      expect(listed.total).toBe(await countOrders(c.scope, c.extra));
      expect(listed.total).toBeGreaterThan(0);
    }
    expect(ordersDrillHref(scopeA(MARCH_NOW), {}, [orgA])).not.toContain("org=");
    expect(ordersDrillHref(scopeA(MARCH_NOW), {}, [orgA, orgB])).toContain(`org=${orgA}`);
    expect(() => ordersDrillHref(scopeA(MARCH_NOW), { status: ["active", "paused"] })).toThrow();
  });

  it("needs review lists cancelled-but-kept, coin-reduced, partly refunded and refunded-without-ledger orders", async () => {
    const rows = await needsReviewRows(scopeA(MARCH_NOW));
    expect(rows.map((r) => r.orderPublicId).sort()).toEqual([o.cancelled, o.coin, o.legacy, o.stripe].sort());
    const by = (id: string) => rows.find((r) => r.orderPublicId === id)!;
    expect(by(o.cancelled)).toMatchObject({ reasons: ["cancelled_paid"], paid: 113, total: 113, diff: 0, kept: 113 });
    expect(by(o.coin)).toMatchObject({ reasons: ["paid_ne_total"], paid: 90, total: 113, diff: -23, kept: 90 });
    // The legacy refund already left: nothing kept, so only the missing ledger row is reported.
    expect(by(o.legacy)).toMatchObject({ reasons: ["refunded_no_ledger"], paid: 113, kept: 0 });
    // Partial Stripe refund of a surcharged payment: 58 x 113/116 = 56.50 off the paid basis.
    expect(by(o.stripe)).toMatchObject({ reasons: ["paid_ne_total"], paid: 113, kept: 56.5, diff: -56.5 });
    // The add-on order's paid (113 + 20) equals its snapshot total (133): not flagged.
  });

  it("each refund path writes exactly one ledger refund row on the charged basis", async () => {
    const rowsOf = async (publicId: string) => {
      const [r] = await db.select({ id: orders.id }).from(orders).where(eq(orders.publicId, publicId));
      return (await db.select().from(ledgerEntries).where(eq(ledgerEntries.orderId, r.id))).filter((l) => l.type === "refund").map((l) => Number(l.amount));
    };
    expect(await rowsOf(o.refunded)).toEqual([113]);
    expect(await rowsOf(o.hold)).toEqual([113]);
    expect(await rowsOf(o.surf)).toEqual([116]);
    expect(await rowsOf(o.stripe)).toEqual([58]);
  });
});
