import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ name: "Asha Rao", email: "a@x.ca", phone }] }) }) }) },
}));

let cfg: Record<string, unknown> = {};
let cards: unknown[] = [];
let customer: string | null = null;
const createSession = vi.fn();
vi.mock("@/lib/payments/stripe", () => ({
  stripeRuntime: async () => ({ cfg, stripe: { customerSessions: { create: (...a: unknown[]) => createSession(...a) } } }),
  customerStore: { get: async () => customer },
}));
vi.mock("@/lib/services/payment-stripe", () => ({ listSavedCards: async () => cards }));
vi.mock("@/lib/services/app-settings.service", () => ({ getAppSettings: async () => ({ defaultCountry: "CA" }) }));
let phone: string | null = null;

const { cardCheckoutContext, customerSessionSecret } = await import("../card-checkout-context");
const on = (over: Record<string, unknown> = {}) => ({
  publishableKey: "pk_test_x",
  methodLabel: "Card",
  surcharge: { enabled: true, ratePct: 2.4, excludeProvinces: ["QC"], ...over },
});

describe("cardCheckoutContext", () => {
  beforeEach(() => { cfg = on(); cards = []; phone = null; customer = null; createSession.mockReset().mockResolvedValue({ client_secret: "cuss_secret" }); });

  it("notes the fee outside excluded provinces", async () => {
    expect((await cardCheckoutContext("u1", "ON")).feeNote).toBe("+2.4% fee on credit cards");
  });
  it("omits the note in an excluded province", async () => {
    expect((await cardCheckoutContext("u1", "QC")).feeNote).toBeNull();
  });
  it("omits the note for an unknown province", async () => {
    expect((await cardCheckoutContext("u1", null)).feeNote).toBeNull();
  });
  it("omits the note when disabled or rate is 0", async () => {
    cfg = on({ enabled: false });
    expect((await cardCheckoutContext("u1", "ON")).feeNote).toBeNull();
    cfg = on({ ratePct: 0 });
    expect((await cardCheckoutContext("u1", "ON")).feeNote).toBeNull();
  });
  it("returns prefill, key, label and no cards without a customer", async () => {
    const c = await cardCheckoutContext("u1", "ON");
    expect(c).toMatchObject({ publishableKey: "pk_test_x", methodLabel: "Card", savedCards: [], prefill: { email: "a@x.ca", name: "Asha Rao", phone: null, address: { line1: "", line2: "", city: "", state: "", postal_code: "", country: "CA" } } });
  });
  it("never mints a session at page render", async () => {
    customer = "cus_1";
    expect(await cardCheckoutContext("u1", "ON")).not.toHaveProperty("customerSessionClientSecret");
    expect(createSession).not.toHaveBeenCalled();
  });
  it("has no customer session for a customer Stripe does not know", async () => {
    expect(await customerSessionSecret("u1")).toBeNull();
    expect(createSession).not.toHaveBeenCalled();
  });
  it("opens a removable saved-card session for a known Stripe customer", async () => {
    customer = "cus_1";
    expect(await customerSessionSecret("u1")).toBe("cuss_secret");
    expect(createSession).toHaveBeenCalledWith({
      customer: "cus_1",
      components: { payment_element: { enabled: true, features: {
        payment_method_redisplay: "enabled", payment_method_save: "enabled", payment_method_save_usage: "off_session", payment_method_remove: "enabled",
      } } },
    });
  });
  it("still pays with a new card when the session cannot be created", async () => {
    customer = "cus_gone";
    createSession.mockRejectedValue(new Error("No such customer"));
    expect(await customerSessionSecret("u1")).toBeNull();
  });
  it("billing details carry the full order address in the market country and an E.164 phone", async () => {
    phone = "(647) 555-0143";
    const c = await cardCheckoutContext("u1", "ON", { addressLine: "100 Queen St W", addressUnit: "1204", city: "Toronto", postalCode: "M5H 2N2" });
    expect(c.prefill).toMatchObject({ phone: "+16475550143", address: { line1: "100 Queen St W", line2: "1204", city: "Toronto", state: "ON", postal_code: "M5H 2N2", country: "CA" } });
  });
});
