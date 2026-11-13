import { describe, expect, it } from "vitest";
import { openTiffinCount, type DeliveryForOpenCount } from "../tiffin-counts";

const NOW = 1_000_000;
const row = (over: Partial<DeliveryForOpenCount>): DeliveryForOpenCount => ({
  status: "scheduled", cutoffAt: NOW + 1, tiffinUnits: 1, complimentaryNote: null, mergedIntoDeliveryId: null, ...over,
});

describe("openTiffinCount", () => {
  it("is the whole plan when no trip has passed cutoff", () => {
    expect(openTiffinCount(20, [row({}), row({})], NOW)).toBe(20);
  });

  it("drops the units of scheduled trips at or past cutoff", () => {
    const rows = [row({ cutoffAt: NOW - 1 }), row({ cutoffAt: NOW, tiffinUnits: 3 }), row({})];
    expect(openTiffinCount(20, rows, NOW)).toBe(16);
  });

  it("keeps paused, skipped and cancelled trips in the count: their tiffins are delivered later", () => {
    const rows = [row({ status: "paused", cutoffAt: 1 }), row({ status: "skipped", cutoffAt: 1 }), row({ status: "cancelled", cutoffAt: 1 })];
    expect(openTiffinCount(20, rows, NOW)).toBe(20);
  });

  it("ignores complimentary and merged trips: they are not part of the paid count", () => {
    const rows = [row({ cutoffAt: 1, complimentaryNote: "sorry" }), row({ cutoffAt: 1, mergedIntoDeliveryId: 9n })];
    expect(openTiffinCount(20, rows, NOW)).toBe(20);
  });

  it("never goes below zero", () => {
    expect(openTiffinCount(2, [row({ cutoffAt: 1, tiffinUnits: 5 })], NOW)).toBe(0);
  });
});
