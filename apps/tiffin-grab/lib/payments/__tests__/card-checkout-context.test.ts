import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/db/client", () => ({
  db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [{ name: "Asha Rao", email: "a@x.ca", phone: null }] }) }) }) },
}));

let cfg: Record<string, unknown> = {};
let cards: unknown[] = [];
vi.mock("@/lib/payments/stripe", () => ({ stripeRuntime: async () => ({ cfg }) }));
vi.mock("@/lib/services/payment-stripe", () => ({ listSavedCards: async () => cards }));

const { cardCheckoutContext } = await import("../card-checkout-context");
const on = (over: Record<string, unknown> = {}) => ({
  publishableKey: "pk_test_x",
  methodLabel: "Card",
  surcharge: { enabled: true, ratePct: 2.4, excludeProvinces: ["QC"], ...over },
});

describe("cardCheckoutContext", () => {
  beforeEach(() => { cfg = on(); cards = []; });

  it("notes the fee outside excluded provinces", async () => {
    expect((await cardCheckoutContext("u1", "ON")).feeNote).toBe("+2.4% fee on credit cards");
  });
  it("omits the note in an excluded province", async () => {
    expect((await cardCheckoutContext("u1", "QC")).feeNote).toBeNull();
  });
  it("omits the note when disabled or rate is 0", async () => {
    cfg = on({ enabled: false });
    expect((await cardCheckoutContext("u1", "ON")).feeNote).toBeNull();
    cfg = on({ ratePct: 0 });
    expect((await cardCheckoutContext("u1", "ON")).feeNote).toBeNull();
  });
  it("returns prefill, key, label and no cards without a customer", async () => {
    const c = await cardCheckoutContext("u1", "ON");
    expect(c).toMatchObject({ publishableKey: "pk_test_x", methodLabel: "Card", savedCards: [], prefill: { email: "a@x.ca", name: "Asha Rao", phone: null } });
  });
});
