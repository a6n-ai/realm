import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const locks = vi.hoisted(() => new Map<string, string>());
vi.mock("@/lib/redis", async (orig) => {
  const real = await orig<typeof import("@/lib/redis")>();
  return {
    ...real,
    getRedis: () =>
      new Proxy(real.getRedis(), {
        get: (t, prop) => {
          if (prop === "set") return (k: string, ...rest: unknown[]) => (k.startsWith("pay-lock:") ? (locks.has(k) ? null : (locks.set(k, String(rest[0])), "OK")) : (t.set as Function)(k, ...rest));
          if (prop === "eval") return async (_s: string, _n: number, k: string, owner: string) => (locks.get(k) === owner ? (locks.delete(k), 1) : 0);
          const v = (t as unknown as Record<string | symbol, unknown>)[prop];
          return typeof v === "function" ? v.bind(t) : v;
        },
      }),
  };
});
let session: { user: { id: string; email: string } } | null = null;
let sessionUserId: bigint | null = null;
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => session }));
vi.mock("@/lib/services/session-service", async (orig) => ({ ...(await orig<object>()), currentUserId: async () => sessionUserId }));
vi.mock("@/lib/services/contact-on-file", () => ({ getContactOnFile: async () => ({ fullName: "Pay Test" }) }));
vi.mock("@/lib/catalog/zone-match", () => ({ findZone: async () => ({ name: "Downtown" }) }));
vi.mock("@/lib/tenant/resolve-request-org", () => ({ resolveRequestOrg: async () => null }));
vi.mock("@/lib/services/customers.service", () => ({ sendAccountSetupEmail: vi.fn() }));
vi.mock("@foundry/places", () => ({ resolveAndPersist: async () => null }));
vi.mock("@/app/(marketing)/contact/actions", () => ({ createWebsiteInquiry: vi.fn() }));
vi.mock("@/lib/payments/stripe", async (orig) => ({
  ...(await orig<object>()),
  stripeRuntime: async () => ({
    stripe: { paymentIntents: { cancel: async () => ({}), retrieve: async () => ({ status: "canceled", latest_charge: null }) } },
    cfg: { surcharge: { enabled: false, ratePct: 0, excludeProvinces: [], networksNotifiedOn: "2026-09-01" }, tax: { enabled: false, taxCode: "txcd_x", surchargeTaxable: false } },
  }),
}));
const payByCard = vi.fn(async (..._a: unknown[]) => ({ kind: "succeeded" as const }));
vi.mock("@/lib/services/payment-stripe", async (orig) => ({ ...(await orig<object>()), payByCard: (...a: unknown[]) => payByCard(...a) }));

const { db } = await import("@/db/client");
const { orders, payments, users, orderActivities, coupons } = await import("@/db/schema");
const { payCheckout } = await import("../actions");
const { setPaymentConfig } = await import("@/lib/services/app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { baseInput, reset, cleanup } = await import("@/lib/services/__tests__/stripe-fixture");

async function signInAs(email: string) {
  const [u] = await db.insert(users).values({ email, role: "user" }).onConflictDoUpdate({ target: users.email, set: { role: "user" } }).returning();
  session = { user: { id: u!.publicId, email } };
  sessionUserId = u!.id;
}

async function pay(over: { paymentPublicId?: string | null; paymentMethodId?: string; phone?: string; couponCode?: string; mutate?: (base: Awaited<ReturnType<typeof baseInput>>) => void } = {}) {
  const { paymentMethodId, ...base } = await baseInput({ paymentMethodId: over.paymentMethodId ?? "stripe", phone: over.phone, couponCode: over.couponCode });
  over.mutate?.(base as Awaited<ReturnType<typeof baseInput>>);
  return payCheckout({
    ...base,
    paymentMethodId: paymentMethodId!,
    paymentPublicId: over.paymentPublicId ?? null,
    source: { confirmationTokenId: "ctoken_1" },
    acceptSurcharge: false,
  } as Parameters<typeof payCheckout>[0]);
}
const allOrders = () => db.select().from(orders);

describe("payCheckout", () => {
  beforeEach(async () => {
    await reset();
    await db.delete(coupons).where(eq(coupons.code, "PAYTEST5"));
    await setPaymentConfig({
      methods: [
        { id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", payeeHandle: "p@x.ca", taxes: [] },
        { id: "stripe", kind: "online", enabled: true, label: "Card", taxes: [] },
      ],
    });
    await sharedCache("app-settings").evictAll();
    payByCard.mockClear();
    locks.clear();
    await signInAs("a@test.invalid");
  });
  afterAll(async () => {
    await db.delete(coupons).where(eq(coupons.code, "PAYTEST5"));
    await cleanup();
  });

  it("creates the order on first pay", async () => {
    const r = await pay();
    expect("ok" in r).toBe(true);
    const os = await allOrders();
    expect(os).toHaveLength(1);
    expect(os[0]!.status).toBe("pending");
    const [p] = await db.select().from(payments);
    expect(p!.status).toBe("awaiting_payment");
    expect(payByCard).toHaveBeenCalledTimes(1);
    expect(payByCard.mock.calls[0]![0]).toMatchObject({ paymentPublicId: p!.publicId, userPublicId: session!.user.id });
  });

  it("reuses the order on retry", async () => {
    const first = await pay();
    if (!("ok" in first)) throw new Error(first.error);
    await pay({ paymentPublicId: first.paymentPublicId });
    expect(await allOrders()).toHaveLength(1);
    expect(payByCard).toHaveBeenCalledTimes(2);
    expect(payByCard.mock.calls[1]![0]).toMatchObject({ paymentPublicId: first.paymentPublicId });
  });

  it("new inputs replace the old unpaid order", async () => {
    const first = await pay();
    if (!("ok" in first)) throw new Error(first.error);
    const second = await pay();
    if (!("ok" in second)) throw new Error(second.error);
    expect(second.paymentPublicId).not.toBe(first.paymentPublicId);
    const os = await allOrders();
    expect(os.map((o) => o.status).sort()).toEqual(["cancelled", "pending"]);
    const old = os.find((o) => o.status === "cancelled")!;
    const notes = (await db.select().from(orderActivities).where(eq(orderActivities.orderId, old.id))).map((a) => a.note);
    expect(notes).toContain("Replaced by a new card checkout");
  });

  it("foreign paymentPublicId is ignored", async () => {
    await signInAs("b@test.invalid");
    const theirs = await pay({ phone: "+16475550111" });
    if (!("ok" in theirs)) throw new Error(theirs.error);
    await signInAs("a@test.invalid");
    const mine = await pay({ paymentPublicId: theirs.paymentPublicId });
    if (!("ok" in mine)) throw new Error(mine.error);
    expect(mine.paymentPublicId).not.toBe(theirs.paymentPublicId);
    const os = await allOrders();
    expect(os).toHaveLength(2);
    expect(os.every((o) => o.status === "pending")).toBe(true);
    expect(payByCard.mock.calls[1]![0]).toMatchObject({ paymentPublicId: mine.paymentPublicId });
  });

  it("a stale payment id with a changed coupon places a new order at the new quote", async () => {
    await db.insert(coupons).values({ code: "PAYTEST5", kind: "fixed", name: "Pay test", valueAmount: "5" });
    const first = await pay();
    if (!("ok" in first)) throw new Error(first.error);
    const second = await pay({ paymentPublicId: first.paymentPublicId, couponCode: "PAYTEST5" });
    if (!("ok" in second)) throw new Error(second.error);
    expect(second.paymentPublicId).not.toBe(first.paymentPublicId);
    const byPay = async (id: string) => {
      const [row] = await db.select({ amount: payments.amount, status: orders.status }).from(payments).innerJoin(orders, eq(orders.id, payments.orderId)).where(eq(payments.publicId, id));
      return row!;
    };
    const [a, b] = [await byPay(first.paymentPublicId), await byPay(second.paymentPublicId)];
    expect(a.status).toBe("cancelled");
    expect(b.status).toBe("pending");
    expect(Number(b.amount)).toBeLessThan(Number(a.amount));
    expect(payByCard.mock.calls[1]![0]).toMatchObject({ paymentPublicId: second.paymentPublicId });
  });

  it("an expired payment is not reused", async () => {
    const first = await pay();
    if (!("ok" in first)) throw new Error(first.error);
    await db.update(payments).set({ expiresAt: Date.now() - 1 }).where(eq(payments.publicId, first.paymentPublicId));
    const second = await pay({ paymentPublicId: first.paymentPublicId });
    if (!("ok" in second)) throw new Error(second.error);
    expect(second.paymentPublicId).not.toBe(first.paymentPublicId);
  });

  it("two concurrent first presses create one order and one charge", async () => {
    payByCard.mockImplementationOnce(async () => {
      await new Promise((r) => setTimeout(r, 150));
      return { kind: "succeeded" as const };
    });
    const results = await Promise.all([pay(), pay()]);
    expect(results.filter((r) => "ok" in r)).toHaveLength(1);
    expect(results.filter((r) => "error" in r)).toEqual([{ error: "A payment is already in progress." }]);
    expect(await allOrders()).toHaveLength(1);
    expect(payByCard).toHaveBeenCalledTimes(1);
  });

  it("changed eating days with the same price place a new order", async () => {
    const days = (d: string[]) => (base: Awaited<ReturnType<typeof baseInput>>) => { Object.assign(base.selections, { eatingDays: d }); };
    const first = await pay({ mutate: days(["mon", "tue", "wed", "thu", "fri"]) });
    if (!("ok" in first)) throw new Error(first.error);
    const same = await pay({ paymentPublicId: first.paymentPublicId, mutate: days(["mon", "tue", "wed", "thu", "fri"]) });
    if (!("ok" in same)) throw new Error(same.error);
    expect(same.paymentPublicId).toBe(first.paymentPublicId);
    const moved = await pay({ paymentPublicId: first.paymentPublicId, mutate: days(["mon", "tue", "wed", "thu", "sat"]) });
    if (!("ok" in moved)) throw new Error(moved.error);
    expect(moved.paymentPublicId).not.toBe(first.paymentPublicId);
  });

  it("is refused while another card flow holds the customer lock", async () => {
    locks.set(`pay-lock:${session!.user.id}`, "someone-else");
    const r = await pay();
    expect(r).toEqual({ error: "A payment is already in progress." });
    expect(await allOrders()).toHaveLength(0);
    expect(payByCard).not.toHaveBeenCalled();
  });

  it("changed inputs are refused while an older payment is mid-charge, and no order is placed", async () => {
    const first = await pay();
    if (!("ok" in first)) throw new Error(first.error);
    const { tryChargeLock } = await import("@/lib/services/payment-stripe");
    let r: Awaited<ReturnType<typeof pay>> | undefined;
    await db.transaction(async (tx) => {
      expect(await tryChargeLock(tx, first.paymentPublicId)).toBe(true);
      r = await pay({ couponCode: "NOPE" });
    });
    expect(r).toEqual({ error: "A payment is already in progress." });
    const os = await allOrders();
    expect(os).toHaveLength(1);
    expect(os[0]!.status).toBe("pending");
  });

  it("rejects non-card method", async () => {
    const r = await pay({ paymentMethodId: "etransfer" });
    expect("error" in r).toBe(true);
    expect(await allOrders()).toHaveLength(0);
    expect(payByCard).not.toHaveBeenCalled();
  });
});
