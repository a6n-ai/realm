import { describe, expect, it, vi, beforeEach } from "vitest";
import { ValidationError } from "@foundry/commons";

// The serviceability gate is the whole point: an out-of-zone checkout must never
// call createOrder (no order, no payment) — it captures a waitlist inquiry instead.
const createOrder = vi.fn(async (..._a: unknown[]) => ({ deploymentId: "SUB-XXXXXX", publicId: "ord_x" }));
const recordWebsiteInquiry = vi.fn(async (..._a: unknown[]) => ({ ok: true as const, waitlisted: true }));
// The server-side re-resolve — never the client's contact.lat/lng — is what
// gets stored. A fixed stub value lets the override test assert it landed
// instead of whatever the (malicious) input claimed.
const resolveAndPersist = vi.fn(async (..._a: unknown[]) => ({
  lat: 11.111111,
  lng: 22.222222,
  formattedAddress: "1 St, Toronto",
}));
let matchZoneResult: { name: string } | null = null;

vi.mock("@/lib/catalog/load", () => ({ loadCatalogSnapshot: async () => ({ zones: [] }) }));
vi.mock("@/lib/catalog/zone-match", () => ({ findZone: async () => matchZoneResult }));
vi.mock("@/lib/orders/create-order", () => ({
  assertOnePerson: () => {},
  createOrder: (...a: unknown[]) => createOrder(...a),
}));
const updateContact = vi.fn(async (..._a: unknown[]) => ({}));
vi.mock("@/lib/services/users.service", () => ({ usersService: { updateContact: (...a: unknown[]) => updateContact(...a) } }));
vi.mock("@foundry/places", () => ({ resolveAndPersist: (...a: unknown[]) => resolveAndPersist(...a) }));
vi.mock("@/lib/landing/inquiry-intake", () => ({ recordWebsiteInquiry: (...a: unknown[]) => recordWebsiteInquiry(...a) }));
const guardPublicWrite = vi.fn(async (..._a: unknown[]) => {});
vi.mock("@/lib/auth/public-write-guard", () => ({ guardPublicWrite: (...a: unknown[]) => guardPublicWrite(...a) }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "usr_7", email: "j@x.com" } }) }));
vi.mock("@/lib/services/customers.service", () => ({ sendAccountSetupEmail: vi.fn() }));
vi.mock("@/lib/services/session-service", () => ({ currentUserId: async () => 7n }));
vi.mock("@/lib/services/contact-on-file", () => ({ getContactOnFile: async () => ({ fullName: "Jane" }) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { sendVerificationEmail: vi.fn() } } }));
vi.mock("@/db/client", () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => [] }) }) }) } }));

const { confirmSubscription } = await import("../actions");

const input = {
  planKey: "veg",
  selections: {
    mealSizeId: "msz_1", frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
    includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: "2026-07-20",
  },
  contact: { fullName: "Jane", phone: "+16475550111", email: "j@x.com", addressLine: "1 St", city: "Toronto", postalCode: "X0X0X0" },
} as Parameters<typeof confirmSubscription>[0];

describe("confirmSubscription serviceability gate", () => {
  beforeEach(() => {
    createOrder.mockClear();
    recordWebsiteInquiry.mockClear();
    resolveAndPersist.mockClear();
    guardPublicWrite.mockClear();
  });

  it("out-of-zone → waitlist inquiry, NO order/payment", async () => {
    matchZoneResult = null;
    const res = await confirmSubscription(input);
    expect(res).toEqual({ ok: true, waitlisted: true });
    expect(recordWebsiteInquiry).toHaveBeenCalledTimes(1);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("out-of-zone waitlist write is capped per IP; over the cap nothing is written", async () => {
    matchZoneResult = null;
    guardPublicWrite.mockRejectedValueOnce(new ValidationError("Too many attempts. Try again in an hour."));
    const res = await confirmSubscription({ ...input, captchaToken: "tok" });
    expect(res).toMatchObject({ error: "Too many attempts. Try again in an hour." });
    expect(guardPublicWrite).toHaveBeenCalledWith("checkout-waitlist", "tok", 10);
    expect(recordWebsiteInquiry).not.toHaveBeenCalled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("in-zone checkout does not spend the waitlist cap", async () => {
    matchZoneResult = { name: "Downtown" };
    await confirmSubscription(input);
    expect(guardPublicWrite).not.toHaveBeenCalled();
  });

  it("in-zone → creates the order", async () => {
    matchZoneResult = { name: "Downtown" };
    const res = await confirmSubscription(input);
    expect(res).toEqual({ ok: true, waitlisted: false, deploymentId: "SUB-XXXXXX", publicId: "ord_x" });
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(recordWebsiteInquiry).not.toHaveBeenCalled();
  });

  it("never trusts a client-supplied contact.lat/lng — stores the server re-resolve instead", async () => {
    matchZoneResult = { name: "Downtown" };
    // A malicious/stale client claims coordinates right next to the shop —
    // nowhere near the typed address the mocked resolveAndPersist "resolves".
    const spoofed = {
      ...input,
      contact: { ...input.contact, lat: 0, lng: 0 },
    } as Parameters<typeof confirmSubscription>[0];
    await confirmSubscription(spoofed);
    expect(resolveAndPersist).toHaveBeenCalledTimes(1);
    expect(resolveAndPersist).toHaveBeenCalledWith({ address: "1 St, Toronto, X0X 0X0" });
    const sentInput = createOrder.mock.calls.at(-1)![0] as { contact: { lat: number; lng: number } };
    expect(sentInput.contact).toMatchObject({ lat: 11.111111, lng: 22.222222 });
  });
});
