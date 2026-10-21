import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

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
const { orders, payments, users, orderActivities } = await import("@/db/schema");
const { payCheckout } = await import("../actions");
const { setPaymentConfig } = await import("@/lib/services/app-settings.service");
const { sharedCache } = await import("@/lib/cache");
const { baseInput, reset, cleanup } = await import("@/lib/services/__tests__/stripe-fixture");

async function signInAs(email: string) {
  const [u] = await db.insert(users).values({ email, role: "user" }).onConflictDoUpdate({ target: users.email, set: { role: "user" } }).returning();
  session = { user: { id: u!.publicId, email } };
  sessionUserId = u!.id;
}

async function pay(over: { paymentPublicId?: string | null; paymentMethodId?: string; phone?: string } = {}) {
  const { paymentMethodId, ...base } = await baseInput({ paymentMethodId: over.paymentMethodId ?? "stripe", phone: over.phone });
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
    await setPaymentConfig({
      methods: [
        { id: "etransfer", kind: "manual", enabled: true, label: "e-Transfer", payeeHandle: "p@x.ca", taxes: [] },
        { id: "stripe", kind: "online", enabled: true, label: "Card", taxes: [] },
      ],
    });
    await sharedCache("app-settings").evictAll();
    payByCard.mockClear();
    await signInAs("a@test.invalid");
  });
  afterAll(cleanup);

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

  it("rejects non-card method", async () => {
    const r = await pay({ paymentMethodId: "etransfer" });
    expect("error" in r).toBe(true);
    expect(await allOrders()).toHaveLength(0);
    expect(payByCard).not.toHaveBeenCalled();
  });
});
