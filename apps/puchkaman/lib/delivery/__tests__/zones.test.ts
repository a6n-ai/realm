import { describe, it, expect } from "vitest";
import { matchZone, deliveryLimitKm, type Zone } from "../zones";

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
