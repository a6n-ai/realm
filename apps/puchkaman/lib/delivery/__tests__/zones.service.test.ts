import { describe, it, expect } from "vitest";
import { rowToZone, rowToType } from "../zones.service";

describe("rowToZone", () => {
  it("converts numeric strings from the DB into numbers", () => {
    const zone = rowToZone({
      name: "Inner",
      radiusKm: "7.00",
      active: true,
    });
    expect(zone).toEqual({
      id: undefined,
      name: "Inner",
      radiusKm: 7,
      active: true,
    });
  });
});

describe("rowToType", () => {
  it("converts numeric strings from the DB into numbers", () => {
    const type = rowToType({
      key: "scheduled",
      label: "Scheduled delivery",
      requiresAddress: true,
      requiresSchedule: true,
      minSubtotal: "35.00",
      discountPct: "0.00",
      sortOrder: 2,
      active: true,
    });
    expect(type).toEqual({
      id: undefined,
      key: "scheduled",
      label: "Scheduled delivery",
      requiresAddress: true,
      requiresSchedule: true,
      minSubtotal: 35,
      discountPct: 0,
      sortOrder: 2,
      active: true,
    });
  });

  it("converts a nonzero discount percentage", () => {
    const type = rowToType({
      key: "instant",
      label: "Instant delivery",
      requiresAddress: true,
      requiresSchedule: false,
      minSubtotal: "0.00",
      discountPct: "15.00",
      sortOrder: 1,
      active: true,
    });
    expect(type.discountPct).toBe(15);
    expect(type.minSubtotal).toBe(0);
  });
});
