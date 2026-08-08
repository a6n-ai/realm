import { describe, it, expect } from "vitest";
import { matchZone, deliveryLimitKm, availableTypes, zoneForType, type Zone, type DeliveryType, type ZoneWithTypes } from "../zones";

function zone(name: string, radiusKm: number, active = true): Zone {
  return {
    name,
    radiusKm,
    feeAmount: 0,
    discountPct: 0,
    minSubtotal: 0,
    requiresScheduling: false,
    active,
  };
}

const zones = [zone("Outer", 15), zone("Inner", 7)]; // deliberately unsorted

describe("matchZone", () => {
  it("picks the smallest zone covering the distance", () => {
    expect(matchZone(2, zones)?.name).toBe("Inner");
  });

  it("falls through to a larger zone when outside the smallest", () => {
    expect(matchZone(9, zones)?.name).toBe("Outer");
  });

  it("treats a distance exactly on the boundary as inside", () => {
    expect(matchZone(7, zones)?.name).toBe("Inner");
  });

  it("returns null beyond every zone", () => {
    expect(matchZone(15.01, zones)).toBeNull();
  });

  it("skips inactive zones", () => {
    expect(matchZone(2, [zone("Inner", 7, false), zone("Outer", 15)])?.name).toBe("Outer");
  });

  it("returns null when there are no zones at all", () => {
    expect(matchZone(1, [])).toBeNull();
  });
});

describe("deliveryLimitKm", () => {
  it("is the largest active radius", () => {
    expect(deliveryLimitKm(zones)).toBe(15);
  });

  it("ignores inactive zones", () => {
    expect(deliveryLimitKm([zone("Inner", 7), zone("Outer", 15, false)])).toBe(7);
  });

  it("is null when nothing is active", () => {
    expect(deliveryLimitKm([zone("Inner", 7, false)])).toBeNull();
  });
});

const instant: DeliveryType = {
  key: "instant", label: "Instant delivery", requiresAddress: true, requiresSchedule: false,
  minSubtotal: 0, discountPct: 15, sortOrder: 1, active: true,
};
const scheduled: DeliveryType = {
  key: "scheduled", label: "Scheduled delivery", requiresAddress: true, requiresSchedule: true,
  minSubtotal: 35, discountPct: 0, sortOrder: 2, active: true,
};

const inner: ZoneWithTypes = { name: "Inner", radiusKm: 7, active: true, types: [instant, scheduled], feeAmount: 0, discountPct: 0, minSubtotal: 0, requiresScheduling: false };
const outer: ZoneWithTypes = { name: "Outer", radiusKm: 20, active: true, types: [scheduled], feeAmount: 0, discountPct: 0, minSubtotal: 0, requiresScheduling: false };
const zonesWithTypes = [outer, inner]; // deliberately unsorted

describe("availableTypes", () => {
  it("offers every type of every covering zone, deduplicated", () => {
    expect(availableTypes(3, zonesWithTypes).map((t) => t.key)).toEqual(["instant", "scheduled"]);
  });

  it("offers only the outer zone's types beyond the inner radius", () => {
    expect(availableTypes(12, zonesWithTypes).map((t) => t.key)).toEqual(["scheduled"]);
  });

  it("treats a distance exactly on a boundary as inside", () => {
    expect(availableTypes(7, zonesWithTypes).map((t) => t.key)).toEqual(["instant", "scheduled"]);
  });

  it("returns nothing beyond every zone", () => {
    expect(availableTypes(20.01, zonesWithTypes)).toEqual([]);
  });

  it("skips inactive zones", () => {
    expect(availableTypes(3, [{ ...inner, active: false }, outer]).map((t) => t.key)).toEqual(["scheduled"]);
  });

  it("skips inactive types", () => {
    const zonesWithDead = [{ ...inner, types: [{ ...instant, active: false }, scheduled] }];
    expect(availableTypes(3, zonesWithDead).map((t) => t.key)).toEqual(["scheduled"]);
  });

  it("orders by type sortOrder", () => {
    const reordered = [{ ...inner, types: [{ ...scheduled, sortOrder: 1 }, { ...instant, sortOrder: 2 }] }];
    expect(availableTypes(3, reordered).map((t) => t.key)).toEqual(["scheduled", "instant"]);
  });
});

describe("zoneForType", () => {
  it("returns the smallest zone offering the requested type", () => {
    expect(zoneForType(3, "scheduled", zonesWithTypes)?.name).toBe("Inner");
  });

  it("falls through to a larger zone when the smaller does not offer it", () => {
    expect(zoneForType(12, "scheduled", zonesWithTypes)?.name).toBe("Outer");
  });

  it("returns null when the type is not offered at that distance", () => {
    expect(zoneForType(12, "instant", zonesWithTypes)).toBeNull();
  });

  it("returns null beyond every zone", () => {
    expect(zoneForType(99, "scheduled", zonesWithTypes)).toBeNull();
  });
});
