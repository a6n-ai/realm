import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { and, eq, inArray } from "drizzle-orm";
import { nextWeekday } from "@foundry/commons";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const requireStaff = vi.fn();
vi.mock("@/lib/auth/guards", () => ({ requireStaff }));
vi.mock("@/lib/auth/session", () => ({ getSession: async () => null }));

const { db } = await import("@/db/client");
const {
  customMealPricing, deliveries, dishCategories, inquiries, ledgerEntries, mealSizeItems, mealSizes,
  orderActivities, orders, payments, plans, users,
} = await import("@/db/schema");
const svc = await import("@/lib/services/custom-meal.service");
const { loadCatalogSnapshot } = await import("@/lib/catalog/load");
const { previewCustomMeal, createOrderFlow } = await import("../actions");
const { previewPrice } = await import("../../inquiries/[id]/order/actions");
const { unwrapAction } = await import("@/lib/actions/unwrap");

type Item = { category: string; planKey: "veg" | "non-veg"; tuAmount: number };

// 1 Non-Veg 12oz sabzi + 2 Veg 8oz sabzi + 6 roti + 1 rice, all in a non-veg meal.
const ITEMS: Item[] = [
  { category: "sabzi", planKey: "non-veg", tuAmount: 1.5 },
  { category: "sabzi", planKey: "veg", tuAmount: 1 },
  { category: "sabzi", planKey: "veg", tuAmount: 1 },
  { category: "roti", planKey: "non-veg", tuAmount: 1.5 },
  { category: "rice", planKey: "non-veg", tuAmount: 1 },
];
const PRICES: [string, string, number, boolean][] = [
  ["sabzi", "veg", 3, true],
  ["sabzi", "non-veg", 4.5, true],
  ["roti", "non-veg", 1, true],
  ["rice", "non-veg", 1, true],
  ["daal", "veg", 2, false],
];

type Prior = { categoryKey: string; planKey: string; row: typeof customMealPricing.$inferSelect | undefined };
const priors: Prior[] = [];
const createdOrderIds: bigint[] = [];
const createdUserIds: bigint[] = [];
let preexistingSizes = new Set<bigint>();

async function pricingRow(categoryKey: string, planKey: string) {
  const [row] = await db.select({ p: customMealPricing }).from(customMealPricing)
    .innerJoin(dishCategories, eq(dishCategories.id, customMealPricing.categoryId))
    .innerJoin(plans, eq(plans.id, customMealPricing.planId))
    .where(and(eq(dishCategories.key, categoryKey), eq(plans.key, planKey))).limit(1);
  return row?.p;
}

beforeAll(async () => {
  for (const [categoryKey, planKey, pricePerTu, active] of PRICES) {
    priors.push({ categoryKey, planKey, row: await pricingRow(categoryKey, planKey) });
    await svc.upsertPricing({ categoryKey, planKey, pricePerTu, maxTu: null, active }, null);
  }
  const existing = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, true));
  preexistingSizes = new Set(existing.map((s) => s.id));
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await db.delete(deliveries).where(inArray(deliveries.orderId, createdOrderIds));
    await db.delete(ledgerEntries).where(inArray(ledgerEntries.orderId, createdOrderIds));
    await db.delete(orderActivities).where(inArray(orderActivities.orderId, createdOrderIds));
    await db.delete(payments).where(inArray(payments.orderId, createdOrderIds));
    await db.delete(inquiries).where(inArray(inquiries.convertedOrderId, createdOrderIds));
    await db.delete(orders).where(inArray(orders.id, createdOrderIds));
  }
  if (createdUserIds.length) await db.delete(users).where(inArray(users.id, createdUserIds));
  const customs = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, true));
  for (const { id } of customs) {
    if (preexistingSizes.has(id)) continue;
    await db.delete(mealSizeItems).where(eq(mealSizeItems.mealSizeId, id));
    await db.delete(mealSizes).where(eq(mealSizes.id, id));
  }
  for (const { categoryKey, planKey, row } of priors) {
    if (row) {
      await svc.upsertPricing({
        categoryKey, planKey, pricePerTu: Number(row.pricePerTu),
        maxTu: row.maxTu == null ? null : Number(row.maxTu), active: row.active,
      }, null);
    } else {
      const current = await pricingRow(categoryKey, planKey);
      if (current) await db.delete(customMealPricing).where(eq(customMealPricing.id, current.id));
    }
  }
});

describe("previewCustomMeal", () => {
  it("returns the composition name and a server-computed per-tiffin price", async () => {
    const r = await previewCustomMeal(ITEMS);
    expect(r).toEqual({
      name: expect.stringContaining("Non-Veg"),
      perTiffin: 15.25, // 1.5×4.50 + 2×1×3 + 1.5×1 + 1×1
    });
    expect(requireStaff).toHaveBeenCalled();
  });

  it("returns an error for an unpriced category instead of throwing", async () => {
    const r = await previewCustomMeal([{ category: "daal", planKey: "veg", tuAmount: 1 }]);
    expect(r).toEqual({ error: expect.stringMatching(/Daal isn't priced for Veg.*Catalog → Custom Meals/) });
  });

  it("rejects a malformed payload as an error", async () => {
    const r = await previewCustomMeal([{ category: "sabzi", planKey: "veg", tuAmount: -1 }]);
    expect(r).toHaveProperty("error");
  });
});

describe("createOrderFlow with a custom meal", () => {
  async function orderInput(suffix: string) {
    const snap = await loadCatalogSnapshot();
    const regular = snap.mealSizes.find((m) => !m.custom && m.planKey === "veg")!;
    const phone = `+1416555${suffix}`;
    const email = `cm-flow-${suffix}-${Math.random().toString(36).slice(2)}@test.invalid`;
    return {
      phone, email,
      order: {
        // A client-sent plan/size must be ignored for custom meals.
        planKey: "veg",
        selections: {
          mealSizeId: regular.publicId, frequencyKey: "5_day", persons: 1, mealSlots: ["lunch"],
          includeSaturday: false, includeSunday: false, durationWeeks: 1,
          startDate: nextWeekday(new Date()).toISOString().slice(0, 10),
        },
        contact: { email, fullName: "Custom Flow", phone, addressLine: "1 St", city: "Toronto", postalCode: "M5V 2T6" },
      },
    };
  }

  async function flow(suffix: string, basePriceOverride: number | null, items: Item[] = ITEMS) {
    const { phone, email, order } = await orderInput(suffix);
    const r = await unwrapAction(createOrderFlow({
      source: { sourceKey: "manual" },
      contact: { fullName: "Custom Flow", phone, email },
      order,
      customMeal: { items, basePriceOverride },
    }));
    const [o] = await db.select().from(orders).where(eq(orders.publicId, r.publicId));
    createdOrderIds.push(o.id);
    if (o.userId) createdUserIds.push(o.userId);
    const [size] = await db.select().from(mealSizes).where(eq(mealSizes.id, o.mealSizeId));
    return { o, size };
  }

  it("orders the find-or-created custom size, ignoring the client's size and plan", async () => {
    const { o, size } = await flow("0171", null);
    expect(size.custom).toBe(true);
    const [plan] = await db.select({ key: plans.key }).from(plans).where(eq(plans.id, o.planId));
    expect(plan.key).toBe("non-veg");
  });

  it("records a staff base price override", async () => {
    const { o } = await flow("0172", 5);
    expect((o.pricingSnapshot as { basePriceOverride?: { amount: number } }).basePriceOverride?.amount).toBe(5);
  });

  it("returns an out-of-range override as an error before touching the DB", async () => {
    const r = await createOrderFlow({
      source: { sourceKey: "manual" },
      contact: { fullName: "X", phone: "+14165550173", email: "x@test.invalid" },
      order: {} as never,
      customMeal: { items: ITEMS, basePriceOverride: 5000 },
    });
    expect(r).toHaveProperty("error", expect.stringMatching(/Custom meal/));
  });

  it("previewPrice for a custom meal quotes the same pre-tax price createOrder then charges", async () => {
    for (const [suffix, override] of [["0174", null], ["0175", 1.005]] as const) {
      const { order } = await orderInput(suffix);
      const preview = await previewPrice(order, undefined, undefined, { items: ITEMS, basePriceOverride: override });
      expect(preview.total).toBeGreaterThan(0);
      const { o } = await flow(suffix, override);
      // previewPrice is pre-tax for every order (tax depends on the province resolved at create).
      const snap = o.pricingSnapshot as { subtotal: number; perTiffinPrice: number; total: number; taxTotal: number };
      expect(snap.perTiffinPrice).toBe(preview.perTiffinPrice);
      expect(snap.subtotal).toBe(preview.subtotal);
      expect(Math.round((snap.total - snap.taxTotal) * 100) / 100).toBe(preview.total);
    }
  });

  it("previewPrice never writes a custom size", async () => {
    const { order } = await orderInput("0176");
    const novel: Item[] = [{ category: "sabzi", planKey: "veg", tuAmount: 3.25 }];
    const before = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, true));
    await previewPrice(order, undefined, undefined, { items: novel, basePriceOverride: null });
    const after = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, true));
    expect(after.length).toBe(before.length);
  });

  it("an unpriced composition fails with the staff message before any custom size is created", async () => {
    const unpriced: Item[] = [{ category: "daal", planKey: "veg", tuAmount: 1.75 }];
    const before = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, true));
    await expect(flow("0177", null, unpriced)).rejects.toThrow(/Custom meal: Daal isn't priced for Veg.*Catalog → Custom Meals/);
    const after = await db.select({ id: mealSizes.id }).from(mealSizes).where(eq(mealSizes.custom, true));
    expect(after.length).toBe(before.length);
  });

  it("an override prices a composition whose category has no custom-meal pricing", async () => {
    const unpriced: Item[] = [{ category: "daal", planKey: "veg", tuAmount: 1.25 }];
    expect(await previewCustomMeal(unpriced, 12)).toMatchObject({ perTiffin: 12 });
    const { order } = await orderInput("0178");
    const preview = await previewPrice(order, undefined, undefined, { items: unpriced, basePriceOverride: 12 });
    expect(preview.perTiffinPrice).toBeGreaterThan(0);
    const { o } = await flow("0178", 12, unpriced);
    const snap = o.pricingSnapshot as { subtotal: number; basePriceOverride?: { amount: number; computed: number | null } };
    expect(snap.basePriceOverride).toMatchObject({ amount: 12, computed: null });
    expect(snap.subtotal).toBe(preview.subtotal);
  });
});
