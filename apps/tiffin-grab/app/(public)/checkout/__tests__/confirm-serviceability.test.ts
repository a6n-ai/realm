import { describe, expect, it, vi, beforeEach } from "vitest";

// The serviceability gate is the whole point: an out-of-zone checkout must never
// call createOrder (no order, no payment) — it captures a waitlist inquiry instead.
const createOrder = vi.fn(async () => ({ deploymentId: "SUB-XXXXXX", publicId: "ord_x" }));
const createWebsiteInquiry = vi.fn(async () => ({ ok: true as const, waitlisted: true }));
let matchZoneResult: { name: string } | null = null;

vi.mock("@/lib/catalog/load", () => ({ loadCatalogSnapshot: async () => ({ zones: [] }) }));
vi.mock("@/lib/catalog/postal", () => ({ matchZone: () => matchZoneResult }));
vi.mock("@/lib/services/orders.service", () => ({ createOrder: (...a: unknown[]) => createOrder(...a) }));
vi.mock("@/app/(marketing)/contact/actions", () => ({ createWebsiteInquiry: (...a: unknown[]) => createWebsiteInquiry(...a) }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));
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
  beforeEach(() => { createOrder.mockClear(); createWebsiteInquiry.mockClear(); });

  it("out-of-zone → waitlist inquiry, NO order/payment", async () => {
    matchZoneResult = null;
    const res = await confirmSubscription(input);
    expect(res).toEqual({ waitlisted: true });
    expect(createWebsiteInquiry).toHaveBeenCalledTimes(1);
    expect(createOrder).not.toHaveBeenCalled();
  });

  it("in-zone → creates the order", async () => {
    matchZoneResult = { name: "Downtown" };
    const res = await confirmSubscription(input);
    expect(res).toEqual({ waitlisted: false, deploymentId: "SUB-XXXXXX", publicId: "ord_x" });
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createWebsiteInquiry).not.toHaveBeenCalled();
  });
});
