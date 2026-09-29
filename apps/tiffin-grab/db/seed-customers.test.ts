import { afterAll, describe, expect, it } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import type { CategoryUnit } from "../lib/custom-meal/composition";
import { db } from "./client";
import { mealSizes, orderActivities, orders, users } from "./schema";
import { loadCatalogSnapshot } from "../lib/catalog/load";
import { loadCategoryUnits } from "../lib/services/custom-meal.service";
import {
  applyOne, catalogKeyFor, dedupeByPhone, hasVegConflict, mapRow, mixedKindDuplicates, planSeed, remainingTiffins, wordpressPosition, type WpRow,
} from "./seed-customers";

function row(over: Partial<WpRow> = {}): WpRow {
  return {
    id: 1,
    status: "wc-processing",
    email: "T@Example.com",
    firstName: "Test",
    lastName: "Customer",
    phone: "647-000-0000",
    address1: "1 Main St",
    address2: null,
    city: "Toronto",
    postcode: "m5v 2t6",
    preferredDays: "Monday - Friday",
    totalTiffins: "20",
    veg: "Veg",
    startDate: "2026-09-28",
    deliveryType: "Delivery",
    products: "Veg 4 Item Thali (Regular)",
    qty: "1",
    customerNote: null,
    history: null,
    ...over,
  };
}

describe("parsePreferredDays (via mapRow)", () => {
  it("keeps the 5-day key and Mon-Fri eating days for the full Mon-Fri phrase", () => {
    const r = mapRow(row({ preferredDays: "Monday - Friday" }));
    expect(r.frequencyKey).toBe("5_day");
    expect(r.eatingDays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });

  it("keeps the mwf key for the exact MWF phrase", () => {
    const r = mapRow(row({ preferredDays: "Monday - Wednesday - Friday" }));
    expect(r.frequencyKey).toBe("mwf");
    expect(r.eatingDays).toEqual(["mon", "wed", "fri"]);
  });

  it("adds a weekend suffix to the eating days", () => {
    const r = mapRow(row({ preferredDays: "Monday - Friday - Saturday" }));
    expect(r.eatingDays).toEqual(["mon", "tue", "wed", "thu", "fri", "sat"]);
    expect(r.includeSaturday).toBe(true);
  });

  it("defaults to 5-day for blank text", () => {
    expect(mapRow(row({ preferredDays: null })).eatingDays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });

  it("maps any other pick to the 5-day route with those eating days", () => {
    const r = mapRow(row({ preferredDays: "Monday - Tuesday - Thursday" }));
    expect(r.frequencyKey).toBe("5_day");
    expect(r.eatingDays).toEqual(["mon", "tue", "thu"]);
  });
});

describe("mapRow", () => {
  it("normalises contact fields and folds a non-default delivery type into the note", () => {
    const r = mapRow(row({ deliveryType: "Delivery at Basement", customerNote: "Ring twice", address2: "Unit 4" }));
    expect(r).toMatchObject({
      fullName: "Test Customer",
      phone: "6470000000",
      email: "t@example.com",
      postalCode: "M5V 2T6",
      addressUnit: "Unit 4",
      deliveryInstructions: "Delivery at Basement. Ring twice",
    });
  });

  it("drops the plain 'Delivery' type", () => {
    expect(mapRow(row({ deliveryType: "Delivery" })).deliveryInstructions).toBeNull();
  });

  it("reads persons from the line item quantity", () => {
    expect(mapRow(row({ qty: "2" })).persons).toBe(2);
    expect(mapRow(row({ qty: null })).persons).toBe(1);
  });
});

describe("remainingTiffins", () => {
  const history = 'a:2:{s:10:"2026-09-25";a:3:{s:17:"remaining_tiffins";i:20;s:15:"boxes_delivered";i:1;}s:10:"2026-09-26";a:3:{s:17:"remaining_tiffins";i:17;s:15:"boxes_delivered";i:0;}}';

  it("takes the latest entry in the serialized history", () => {
    expect(remainingTiffins(history, "21")).toBe(17);
  });

  it("falls back to the full count before delivery starts", () => {
    expect(remainingTiffins(null, "21")).toBe(21);
  });

  it("never goes negative", () => {
    expect(remainingTiffins('s:17:"remaining_tiffins";i:-2;', "5")).toBe(0);
  });
});

describe("hasVegConflict", () => {
  it("flags a veg product under non-veg meta", () => {
    expect(hasVegConflict(row({ veg: "Non-Veg", products: "4 Item Veg Thali (Large)" }))).toBe(true);
  });

  it("accepts matching diet", () => {
    expect(hasVegConflict(row({ veg: "Non-Veg", products: "5 Item Non-Veg Thali (Regular)" }))).toBe(false);
  });
});

describe("dedupeByPhone", () => {
  it("adds a same-plan renewal's balance to the running plan", () => {
    const { kept, dropped } = dedupeByPhone([mapRow(row({ id: 1, totalTiffins: "5" })), mapRow(row({ id: 2, totalTiffins: "20" }))]);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ wpOrderId: 1, tiffinCount: 25, mergedWpOrderIds: [2] });
    expect(dropped).toEqual([]);
  });

  it("keeps the larger balance when the second plan differs", () => {
    const a = mapRow(row({ id: 1, totalTiffins: "5" }));
    const b = mapRow(row({ id: 2, totalTiffins: "12", products: "Maharaja Thali" }));
    const { kept, dropped } = dedupeByPhone([a, b]);
    expect(kept.map((r) => r.wpOrderId)).toEqual([2]);
    expect(dropped.map((r) => r.wpOrderId)).toEqual([1]);
  });
});

describe("catalogKeyFor", () => {
  it.each([
    ["4 Item Veg Thali Meal (Large)", "veg", "item4_large_veg"],
    ["5 Item Non-Veg Thali (Regular)", "non-veg", "item5_regular_nonveg"],
    ["New Plan Veg", "veg", "new_thali_veg"],
    ["Sabzi Only Non-Veg (Regular)", "non-veg", "sabzi_only_regular_nonveg"],
    ["Maharaja Thali (Non-veg)", "non-veg", "maharaja_nonveg"],
    ["Small Thali", "veg", "small_thali"],
    ["Trial Meal (Non-Veg) (5 Item)", "non-veg", "item5_regular_nonveg"],
    ["Custom Meal - 2 Veg(12oz) + 4 Rotis", "veg", null],
  ] as const)("%s -> %s", (product, plan, key) => {
    expect(catalogKeyFor(product, plan)).toBe(key);
  });
});

describe("planSeed custom meals", () => {
  const units = new Map<string, CategoryUnit>([
    ["sabzi", { key: "sabzi", label: "Sabzi", tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
    ["roti", { key: "roti", label: "Roti", tuUnitType: "count", tuUnitSize: 4, tuUnitLabel: "roti" }],
    ["rice", { key: "rice", label: "Rice", tuUnitType: "count", tuUnitSize: 1, tuUnitLabel: "unit" }],
    ["raita", { key: "raita", label: "Raita", tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
    ["salad", { key: "salad", label: "Salad", tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz" }],
  ]);
  const size = (id: number, key: string, planKey: string) => ({ id: BigInt(id), key, name: key, planKey, tier: "budget", items: [], custom: false });
  const snapshot = {
    mealSizes: [size(1, "item4_regular_veg", "veg"), size(2, "item4_regular_nonveg", "non-veg")],
    zones: [{ name: "Downtown", postalPrefixes: ["M5V"], slotWindow: null, active: true }],
  } as unknown as Parameters<typeof planSeed>[1];

  it("plans a parseable custom meal with its items instead of skipping it", () => {
    const { results } = planSeed([row({ products: "Custom Meal - 2 Veg(8oz) + 4 Rotis + 1 Rice" })], snapshot, units);
    const planned = results.find((r) => r.kind === "planned");
    expect(planned && planned.kind === "planned" && planned.customItems).toEqual([
      { category: "rice", planKey: "veg", tuAmount: 1 },
      { category: "roti", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
      { category: "sabzi", planKey: "veg", tuAmount: 1 },
    ]);
  });

  it("skips an unparseable custom meal with a manual-mapping reason", () => {
    const { results } = planSeed([row({ products: "Custom Meal - 1 GOOD TIFFIN - - - -" })], snapshot, units);
    expect(results[0]).toMatchObject({ kind: "skipped", reason: expect.stringMatching(/map by hand/) });
  });

  it("uses the parsed diet for the plan when WordPress meta says veg but the meal has non-veg", () => {
    const { results } = planSeed([row({ products: "Custom Meal - 1 Non-Veg(8oz) + 4 Rotis", veg: "veg" })], snapshot, units);
    expect(results[0]).toMatchObject({ kind: "planned", record: { planKey: "non-veg" } });
  });
});

describe("mixedKindDuplicates", () => {
  it("pairs a custom and a regular record for the same phone", () => {
    const regular = mapRow(row({ id: 1, totalTiffins: "5" }));
    const custom = mapRow(row({ id: 2, totalTiffins: "12", products: "Custom Meal - 2 Veg(8oz) + 4 Rotis" }));
    const other = mapRow(row({ id: 3, phone: "647-111-1111", totalTiffins: "3", products: "Maharaja Thali" }));
    const { kept, dropped } = dedupeByPhone([regular, custom, other]);
    expect(mixedKindDuplicates(kept, dropped).map((p) => [p.kept.wpOrderId, p.dropped.wpOrderId])).toEqual([[2, 1]]);
  });

  it("ignores two regular plans on one phone", () => {
    const { kept, dropped } = dedupeByPhone([mapRow(row({ id: 1 })), mapRow(row({ id: 2, products: "Maharaja Thali" }))]);
    expect(dropped).toHaveLength(1);
    expect(mixedKindDuplicates(kept, dropped)).toEqual([]);
  });
});

describe("applyOne (tiffin_v2)", () => {
  const TODAY = new Date().toISOString().slice(0, 10);
  const PHONE = "6470009871";
  const EMAIL = "zz-seed-liveplan@example.test";
  const ids = [990001, 990002];

  afterAll(async () => {
    const os = await db.select({ id: orders.id }).from(orders).where(inArray(orders.deploymentId, ids.map((i) => `wc-${i}`)));
    if (os.length) {
      await db.delete(orderActivities).where(inArray(orderActivities.orderId, os.map((o) => o.id)));
      await db.delete(orders).where(inArray(orders.id, os.map((o) => o.id)));
    }
    await db.delete(users).where(eq(users.email, EMAIL));
  });

  it("skips a new order when the customer already has a live plan, creating nothing", async () => {
    const [snapshot, units] = await Promise.all([loadCatalogSnapshot(), loadCategoryUnits()]);
    const plan = (r: WpRow) => {
      const res = planSeed([r], snapshot, units).results[0];
      if (res.kind !== "planned") throw new Error(`not planned: ${res.reason}`);
      return res;
    };
    const base = { phone: PHONE, email: EMAIL };
    expect(await applyOne(plan(row({ ...base, id: ids[0] })), snapshot, null, TODAY)).toBe("created");

    const customsBefore = await db.select({ id: mealSizes.id }).from(mealSizes).where(like(mealSizes.key, "custom_%"));
    await expect(applyOne(plan(row({ ...base, id: ids[1], products: "Custom Meal - 3 Veg(8oz) + 8 Rotis + 2 Rice" })), snapshot, null, TODAY))
      .rejects.toThrow(`customer already has a live plan: wc-${ids[0]}`);
    const customsAfter = await db.select({ id: mealSizes.id }).from(mealSizes).where(like(mealSizes.key, "custom_%"));
    expect(customsAfter.length).toBe(customsBefore.length);
    expect(await db.select().from(orders).where(eq(orders.deploymentId, `wc-${ids[1]}`))).toEqual([]);
  });
});

describe("wordpressPosition", () => {
  const day = (date: string, rem: number, boxes: number) =>
    `s:10:"${date}";a:3:{s:17:"remaining_tiffins";i:${rem};s:13:"delivery_days";a:2:{i:0;i:1;i:1;i:2;}s:15:"boxes_delivered";i:${boxes};}`;
  const history = `a:4:{${day("2026-09-24", 12, 1)}${day("2026-09-25", 11, 2)}${day("2026-09-26", 11, 0)}${day("2026-09-27", 11, 0)}}`;

  it("finds the last day a box went out and the total delivered", () => {
    expect(wordpressPosition(history)).toEqual({ lastDeliveredDate: "2026-09-25", deliveredCount: 3 });
  });

  it("has no position before delivery starts", () => {
    expect(wordpressPosition(null)).toEqual({ lastDeliveredDate: null, deliveredCount: 0 });
  });

  it("agrees with remainingTiffins on the same history", () => {
    expect(remainingTiffins(history, "20")).toBe(11);
  });
});
