import { describe, expect, it } from "vitest";
import { catalogKeyFor, dedupeByPhone, hasVegConflict, mapRow, remainingTiffins, wordpressPosition, type WpRow } from "./seed-customers";

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
