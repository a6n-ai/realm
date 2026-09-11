import { describe, expect, it } from "vitest";
import { customFrequencyKey } from "../lib/menu/delivery-days";
import { mapRow } from "./migrate-wordpress-customers";

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
  it("keeps the 5-day key for the full Mon-Fri phrase", () => {
    expect(mapRow(row("Monday - Tuesday - Wednesday - Thursday - Friday")).frequencyKey).toBe("5_day");
    expect(mapRow(row("Monday - Tuesday - Wednesday - Thursday - Friday")).weekdays).toBeNull();
  });

  it("keeps the mwf key for the exact MWF phrase", () => {
    const r = mapRow(row("Monday - Wednesday - Friday"));
    expect(r.frequencyKey).toBe("mwf");
    expect(r.weekdays).toBeNull();
  });

  it("defaults to 5-day for blank text", () => {
    const r = mapRow(row(""));
    expect(r.frequencyKey).toBe("5_day");
    expect(r.weekdays).toBeNull();
  });

  it("derives a custom key + sorted weekday set for an arbitrary pattern", () => {
    const r = mapRow(row("Tuesday - Thursday"));
    expect(r.frequencyKey).toBe("custom_tue_thu");
    expect(r.weekdays).toEqual(["tue", "thu"]);
  });

  it("is order-independent and produces the same key regardless of phrasing order", () => {
    const a = mapRow(row("Friday - Tuesday"));
    const b = mapRow(row("Tuesday and Friday"));
    expect(a.frequencyKey).toBe(b.frequencyKey);
    expect(a.weekdays).toEqual(b.weekdays);
  });

  it("keeps weekend flags independent of the core weekday set", () => {
    const r = mapRow(row("Tuesday - Thursday - Saturday"));
    expect(r.weekdays).toEqual(["tue", "thu"]);
    expect(r.includeSaturday).toBe(true);
    expect(r.includeSunday).toBe(false);
  });
});

describe("customFrequencyKey", () => {
  it("is stable regardless of input order", () => {
    expect(customFrequencyKey(["thu", "tue"])).toBe(customFrequencyKey(["tue", "thu"]));
  });
});
