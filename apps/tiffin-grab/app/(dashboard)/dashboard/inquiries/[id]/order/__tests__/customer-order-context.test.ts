// The staff order form's customer lookup says nothing about an account, not even that a
// phone and an email are two different customers, unless the caller can already see it.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";
import { db } from "@/db/client";
import { deliveries, ledgerEntries, orders, payments, users } from "@/db/schema";

const visible = vi.hoisted(() => ({ orgs: "all" as "all" | string[] }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
vi.mock("@/lib/auth/guards", () => ({ requireStaff: async () => {}, requireAdmin: async () => {} }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => ({ user: { id: "usr_staff" } }) }));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/services/orders.service", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/services/orders.service")>()),
  resolveSessionVisibleOrgIds: async () => visible.orgs,
}));

const { customerOrderContext } = await import("../actions");
const { createOrder } = await import("@/lib/services/orders.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

describe("customerOrderContext: phone and email on two accounts", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(users).values([
      { email: "phone-holder@x.com", phone: "+16475550111", role: "user" },
      { email: "email-holder@x.com", role: "user" },
    ]);
  });
  afterAll(reset);

  it("tells staff who see every organization", async () => {
    visible.orgs = "all";
    expect(await customerOrderContext("email-holder@x.com", "+16475550111")).toMatchObject({ conflict: true, plans: [] });
  });

  it("tells nothing to staff who cannot see both customers", async () => {
    visible.orgs = ["org_mine"];
    expect(await customerOrderContext("email-holder@x.com", "+16475550111")).toEqual({ renewFrom: null, plans: [], conflict: false, addresses: [] });
    visible.orgs = [];
    expect(await customerOrderContext("email-holder@x.com", "+16475550111")).toEqual({ renewFrom: null, plans: [], conflict: false, addresses: [] });
  });

  // Otherwise staff holding one customer's phone could test any email for an account elsewhere.
  it("answers the same for another organization's email as for an email nobody has", async () => {
    const snap = await loadCatalogSnapshot();
    await createOrder({
      planKey: snap.plans[0].key,
      selections: {
        mealSizeId: snap.mealSizes[0].publicId, frequencyKey: "5_day" as const, persons: 1, mealSlots: ["lunch"],
        includeSaturday: false, includeSunday: false, durationWeeks: 1, startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
      },
      contact: { email: "phone-holder@x.com", fullName: "A B", phone: "+16475550111", addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
    });
    const [mine] = await db.select({ org: orders.organizationId }).from(orders);
    visible.orgs = [mine.org!];

    const unknown = await customerOrderContext("nobody@x.com", "+16475550111");
    expect(unknown.plans).toHaveLength(1);
    expect(await customerOrderContext("email-holder@x.com", "+16475550111")).toEqual(unknown);
  });
});
