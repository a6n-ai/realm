import { describe, expect, it } from "vitest";
import { buildBoundedDeliveryRows, mapRow, tripsFor } from "./migrate-wordpress-customers";

function row(preferredDays: string) {
  return {
    Customer: "Test Customer",
    Phone: "6470000000",
    Email: "t@example.com",
    Address: "1 Main St",
    City: "Toronto",
    "Postal Code": "M5V 2T6",
    "Preferred Days": preferredDays,
    Products: "Veg 4 Item Thali (Regular)",
    Quantity: "1",
    "Veg/Non-Veg": "Veg",
    Status: "Processing",
    "Total Tiffins": "20",
    "Remaining Tiffins": "10",
    "Start Date": "2026-01-01",
  };
}

describe("parsePreferredDays (via mapRow)", () => {
  it("keeps the 5-day key and Mon-Fri eating days for the full Mon-Fri phrase", () => {
    const r = mapRow(row("Monday - Tuesday - Wednesday - Thursday - Friday"));
    expect(r.frequencyKey).toBe("5_day");
    expect(r.eatingDays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });

  it("keeps the mwf key for the exact MWF phrase", () => {
    const r = mapRow(row("Monday - Wednesday - Friday"));
    expect(r.frequencyKey).toBe("mwf");
    expect(r.eatingDays).toEqual(["mon", "wed", "fri"]);
  });

  it("treats the literal 'Monday - Friday' plan-label phrase as 5-day, not a 2-day custom pick", () => {
    // Verified against real legacy delivery history: boxes_delivered fires
    // Mon..Fri continuously for orders carrying this exact text. It is the
    // plugin's fixed label for the standard plan, matching 180/263 prod rows.
    const r = mapRow(row("Monday - Friday"));
    expect(r.frequencyKey).toBe("5_day");
    expect(r.eatingDays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });

  it("adds a weekend suffix to the eating days", () => {
    const withSat = mapRow(row("Monday - Friday - Saturday"));
    expect(withSat.frequencyKey).toBe("5_day");
    expect(withSat.includeSaturday).toBe(true);
    expect(withSat.eatingDays).toEqual(["mon", "tue", "wed", "thu", "fri", "sat"]);
    const withSun = mapRow(row("Monday - Friday - Sunday"));
    expect(withSun.includeSunday).toBe(true);
    expect(withSun.eatingDays).toContain("sun");
  });

  it("defaults to 5-day for blank text", () => {
    const r = mapRow(row(""));
    expect(r.frequencyKey).toBe("5_day");
    expect(r.eatingDays).toEqual(["mon", "tue", "wed", "thu", "fri"]);
  });

  it("maps an arbitrary pattern to the 5-day route with those eating days (no custom frequency)", () => {
    const r = mapRow(row("Tuesday - Thursday"));
    expect(r.frequencyKey).toBe("5_day");
    expect(r.eatingDays).toEqual(["tue", "thu"]);
  });

  it("is order-independent regardless of phrasing order", () => {
    expect(mapRow(row("Friday - Tuesday")).eatingDays).toEqual(mapRow(row("Tuesday and Friday")).eatingDays);
  });

  it("keeps weekend flags and adds them after the core weekdays", () => {
    const r = mapRow(row("Tuesday - Thursday - Saturday"));
    expect(r.eatingDays).toEqual(["tue", "thu", "sat"]);
    expect(r.includeSaturday).toBe(true);
    expect(r.includeSunday).toBe(false);
  });
});

describe("buildBoundedDeliveryRows", () => {
  it("carries a Saturday eating day on Friday (no Saturday row) and stops at the target", () => {
    // Monday 2026-09-21; eating Mon + Sat on the 5-day route -> trips Mon(1), Fri(1).
    const rows = buildBoundedDeliveryRows({ startDate: "2026-09-21", trips: tripsFor("5_day", ["mon", "sat"]), persons: 1, targetTiffinCount: 3 });
    expect(rows).toEqual([
      { deliveryDate: "2026-09-21", tiffinUnits: 1 },
      { deliveryDate: "2026-09-25", tiffinUnits: 1 },
      { deliveryDate: "2026-09-28", tiffinUnits: 1 },
    ]);
  });

  it("clamps the crossing row to the remaining balance", () => {
    // Mon..Fri eating on MWF: Mon(2), Wed(2), Fri(1); target 4 -> Mon 2, Wed 2.
    const rows = buildBoundedDeliveryRows({ startDate: "2026-09-21", trips: tripsFor("mwf", ["mon", "tue", "wed", "thu", "fri"]), persons: 1, targetTiffinCount: 3 });
    expect(rows.map((r) => r.tiffinUnits)).toEqual([2, 1]);
  });
});
