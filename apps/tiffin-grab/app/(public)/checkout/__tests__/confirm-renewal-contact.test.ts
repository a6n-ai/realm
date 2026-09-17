import { beforeEach, describe, expect, it, vi } from "vitest";

// The read-only inputs in checkout are cosmetic on their own — the renewal flag
// and the contact both come from the client. These tests pin the guarantee:
// a renewal is placed with the email and address ON FILE, whatever was sent.
const createOrder = vi.fn(async (..._a: unknown[]) => ({ deploymentId: "SUB-XXXXXX", publicId: "ord_x" }));
const matchZone = vi.fn((..._a: unknown[]) => ({ name: "Downtown" }) as { name: string } | null);
let userId: bigint | null = 7n;
let onFile: Record<string, string> | null = null;

vi.mock("@/lib/catalog/load", () => ({ loadCatalogSnapshot: async () => ({ zones: [] }) }));
vi.mock("@/lib/catalog/postal", () => ({ matchZone: (...a: unknown[]) => matchZone(...a) }));
vi.mock("@/lib/services/orders.service", () => ({ createOrder: (...a: unknown[]) => createOrder(...a) }));
vi.mock("@foundry/places", () => ({ resolveAndPersist: async () => null }));
vi.mock("@/app/(marketing)/contact/actions", () => ({ createWebsiteInquiry: vi.fn() }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "usr_7" } }) }));
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

describe("confirmSubscription — renewal keeps the contact on file", () => {
  beforeEach(() => {
    createOrder.mockClear();
    matchZone.mockClear();
    userId = 7n;
    onFile = ON_FILE;
  });

  it("places a renewal with the on-file email and address, ignoring what was sent", async () => {
    await confirmSubscription({ ...submitted, renewal: true });
    expect(sentContact()).toMatchObject({
      email: "priya@example.com",
      addressLine: "10 King St W",
      addressUnit: "402",
      city: "Toronto",
      postalCode: "M5H 1A1",
    });
  });

  it("still lets a renewal change name, phone and delivery instructions", async () => {
    await confirmSubscription({ ...submitted, renewal: true });
    expect(sentContact()).toMatchObject({
      fullName: "Priya S.",
      phone: "+14165559999",
      deliveryInstructions: "Leave at the side door",
    });
  });

  it("checks serviceability against the on-file address, not the submitted one", async () => {
    // Otherwise a renewal could be zone-checked against one address and placed at another.
    await confirmSubscription({ ...submitted, renewal: true });
    expect(matchZone.mock.calls.at(-1)![0]).toBe("M5H 1A1");
  });

  it("does not pass the renewal flag through to createOrder", async () => {
    await confirmSubscription({ ...submitted, renewal: true });
    expect(createOrder.mock.calls.at(-1)![0]).not.toHaveProperty("renewal");
  });

  it("leaves a non-renewal checkout exactly as submitted", async () => {
    await confirmSubscription(submitted);
    expect(sentContact()).toMatchObject({ email: "attacker@example.com", postalCode: "V6B 1A1" });
  });

  it("refuses a renewal from a signed-out request", async () => {
    userId = null;
    await expect(confirmSubscription({ ...submitted, renewal: true })).rejects.toThrow(/sign in/i);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("refuses a renewal when there is no saved address, rather than using the submitted one", async () => {
    onFile = { ...ON_FILE, addressLine: "", postalCode: "" };
    await expect(confirmSubscription({ ...submitted, renewal: true })).rejects.toThrow(/saved address/i);
    expect(createOrder).not.toHaveBeenCalled();
  });
});
