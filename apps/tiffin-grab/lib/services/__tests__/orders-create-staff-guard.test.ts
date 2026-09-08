import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq, ne } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));

const { db } = await import("@/db/client");
const { deliveries, ledgerEntries, orderActivities, orders, payments, users } = await import("@/db/schema");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { createOrder } = await import("../orders.service");
const { STAFF_ACCOUNT_MESSAGE } = await import("../customers.service");

async function reset() {
  await db.delete(deliveries);
  await db.delete(ledgerEntries);
  await db.delete(orderActivities);
  await db.delete(payments);
  await db.delete(orders);
  await db.delete(users).where(ne(users.isSystem, true));
}

async function attemptOrder(phone: string, email: string) {
  const snap = await loadCatalogSnapshot();
  const mealSize = snap.mealSizes.find((m) => m.key === "small_thali");
  if (!mealSize) throw new Error("small_thali not seeded");
  return createOrder({
    planKey: snap.plans[0].key,
    selections: {
      mealSizeId: mealSize.publicId,
      frequencyKey: "5_day",
      persons: 1,
      mealSlots: ["lunch"],
      includeSaturday: false,
      includeSunday: false,
      durationWeeks: 1,
      startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
    },
    // M5V is a seeded Toronto zone -> order lands "active".
    contact: { email, fullName: "A B", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
  });
}

describe("createOrder refuses to attach an order to a staff account (integration)", () => {
  beforeEach(async () => {
    await reset();
    await db.insert(users).values({ phone: "+16475559999", email: "staff-guard@x.com", name: "Staff Person", role: "admin" });
  });
  afterAll(reset);

  it("guest checkout matching a staff phone is refused, not silently attached", async () => {
    await expect(attemptOrder("+16475559999", `u${Math.random().toString(36).slice(2)}@test.invalid`)).rejects.toThrow(
      STAFF_ACCOUNT_MESSAGE,
    );
  });

  it("guest checkout matching a staff email is refused, not silently attached", async () => {
    await expect(attemptOrder("+16475551234", "staff-guard@x.com")).rejects.toThrow(STAFF_ACCOUNT_MESSAGE);
  });

  it("a genuinely new customer (no phone/email collision) still checks out fine", async () => {
    const { publicId } = await attemptOrder("+16475559001", `u${Math.random().toString(36).slice(2)}@test.invalid`);
    const [order] = await db.select().from(orders).where(eq(orders.publicId, publicId));
    expect(order.status).toBe("active");
  });
});
