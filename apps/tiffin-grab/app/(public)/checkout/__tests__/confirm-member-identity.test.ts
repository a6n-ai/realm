import { beforeEach, describe, expect, it, vi } from "vitest";

// The read-only inputs in checkout are cosmetic on their own — the renewal flag
// and the contact both come from the client. These tests pin the guarantee:
// a signed-in order is placed under the ACCOUNT name and email, whatever was sent.
const createOrder = vi.fn(async (..._a: unknown[]) => ({ deploymentId: "SUB-XXXXXX", publicId: "ord_x" }));
const matchZone = vi.fn((..._a: unknown[]) => ({ name: "Downtown" }) as { name: string } | null);
let userId: bigint | null = 7n;
let signedIn = true;
let onFile: Record<string, string> | null = null;

vi.mock("@/lib/catalog/load", () => ({ loadCatalogSnapshot: async () => ({ zones: [] }) }));
// Checkout gates on findZone (postal coverage, then radius); the stub stands in for both.
vi.mock("@/lib/catalog/zone-match", () => ({ findZone: async (...a: unknown[]) => matchZone(...a) }));
vi.mock("@/lib/services/orders.service", () => ({ createOrder: (...a: unknown[]) => createOrder(...a) }));
vi.mock("@foundry/places", () => ({ resolveAndPersist: async () => null }));
const createWebsiteInquiry = vi.fn();
vi.mock("@/app/(marketing)/contact/actions", () => ({ createWebsiteInquiry: (...a: unknown[]) => createWebsiteInquiry(...a) }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => (signedIn ? { user: { id: "usr_7", email: "priya@example.com" } } : null) }));
vi.mock("@/lib/auth", () => ({ auth: { api: { sendVerificationEmail: vi.fn() } } }));
vi.mock("@/lib/tenant/resolve-request-org", () => ({ resolveRequestOrg: async () => null }));
vi.mock("@/lib/services/customers.service", () => ({ sendAccountSetupEmail: vi.fn() }));
vi.mock("@/lib/services/session-service", () => ({ currentUserId: async () => userId }));
vi.mock("@/lib/services/contact-on-file", () => ({ getContactOnFile: async () => onFile }));

const { confirmSubscription } = await import("../actions");

const ON_FILE = {
  fullName: "Priya Shah",
  email: "priya@example.com",
  phone: "+14165551234",
  addressLine: "10 King St W",
  addressUnit: "402",
  city: "Toronto",
  postalCode: "M5H 1A1",
};

// What a tampered request might send: someone else's email and a new address.
const submitted = {
  planKey: "veg",
  selections: {
    mealSizeId: "msz_1", frequencyKey: "custom_mon", persons: 1, mealSlots: ["lunch"],
    includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: "2026-07-20",
  },
  contact: {
    fullName: "Priya S.",
    phone: "+14165559999",
    email: "attacker@example.com",
    addressLine: "999 Elsewhere Rd",
    addressUnit: "",
    city: "Vancouver",
    postalCode: "V6B 1A1",
    deliveryInstructions: "Leave at the side door",
  },
} as Parameters<typeof confirmSubscription>[0];

function sentContact() {
  return (createOrder.mock.calls.at(-1)![0] as { contact: Record<string, unknown> }).contact;
}

describe("confirmSubscription: a signed-in member keeps their account identity", () => {
  beforeEach(() => {
    createOrder.mockClear();
    matchZone.mockClear();
    userId = 7n;
    signedIn = true;
    onFile = ON_FILE;
  });

  it("takes name and email from the account, ignoring a crafted request", async () => {
    await confirmSubscription(submitted);
    expect(sentContact()).toMatchObject({ fullName: "Priya Shah", email: "priya@example.com" });
    await confirmSubscription({ ...submitted, renewal: true });
    expect(sentContact()).toMatchObject({ fullName: "Priya Shah", email: "priya@example.com" });
  });

  it("honours an edited phone, address and delivery instructions for this order", async () => {
    await confirmSubscription({ ...submitted, renewal: true });
    expect(sentContact()).toMatchObject({
      phone: "+14165559999",
      addressLine: "999 Elsewhere Rd",
      city: "Vancouver",
      postalCode: "V6B 1A1",
      deliveryInstructions: "Leave at the side door",
    });
  });

  it("runs zone matching on the ENTERED postal code", async () => {
    await confirmSubscription(submitted);
    expect(matchZone.mock.calls.at(-1)![1]).toMatchObject({ postalCode: "V6B 1A1" });
  });

  it("waitlists an out-of-zone entered postal code under the account identity", async () => {
    matchZone.mockReturnValueOnce(null);
    const r = await confirmSubscription(submitted);
    expect(r).toEqual({ ok: true, waitlisted: true });
    expect(createOrder).not.toHaveBeenCalled();
    expect(createWebsiteInquiry.mock.calls.at(-1)![0]).toMatchObject({ email: "priya@example.com", fullName: "Priya Shah" });
  });

  it("does not pass the renewal flag through to createOrder", async () => {
    await confirmSubscription({ ...submitted, renewal: true });
    expect(createOrder.mock.calls.at(-1)![0]).not.toHaveProperty("renewal");
  });

  it("rejects a member request with no delivery address", async () => {
    expect(await confirmSubscription({ ...submitted, contact: { ...submitted.contact, addressLine: " " } })).toEqual({ error: expect.stringMatching(/delivery address/i) });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("refuses a signed-out checkout — every order needs an owner", async () => {
    signedIn = false;
    userId = null;
    expect(await confirmSubscription(submitted)).toEqual({ error: expect.stringMatching(/sign in/i) });
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("refuses a renewal from a signed-out request", async () => {
    signedIn = false;
    userId = null;
    expect(await confirmSubscription({ ...submitted, renewal: true })).toEqual({ error: expect.stringMatching(/sign in/i) });
    expect(createOrder).not.toHaveBeenCalled();
  });
});
