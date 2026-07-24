import { describe, expect, it } from "vitest";
import { deliveredTiffinCount, remainingTiffinCount, type DeliveryForCounts } from "../tiffin-counts";

const past = 1;
const future = Date.now() + 1e9;
const now = Date.now();

function row(over: Partial<DeliveryForCounts>): DeliveryForCounts {
  return { status: "scheduled", cutoffAt: future, makeupForDeliveryId: null, pooledAt: null, ...over };
}

describe("tiffin-counts", () => {
  it("counts past-cutoff scheduled days × persons as delivered", () => {
    const rows = [row({ cutoffAt: past }), row({ cutoffAt: future })];
    expect(deliveredTiffinCount(2, rows, now)).toBe(2);
    expect(remainingTiffinCount(10, 2, rows, now)).toBe(8);
  });

  it("counts a past-cutoff makeup row (still scheduled) as delivered", () => {
    const rows = [row({ cutoffAt: past, makeupForDeliveryId: 42n })];
    expect(deliveredTiffinCount(1, rows, now)).toBe(1);
  });

  it("does not count past-cutoff skipped/paused as delivered", () => {
    const rows = [
      row({ status: "skipped", cutoffAt: past, pooledAt: 1 }),
      row({ status: "paused", cutoffAt: past, pooledAt: 1 }),
    ];
    expect(deliveredTiffinCount(1, rows, now)).toBe(0);
  });

  it("does not count future scheduled or cancelled as delivered", () => {
    const rows = [row({ cutoffAt: future }), row({ status: "cancelled", cutoffAt: past })];
    expect(deliveredTiffinCount(3, rows, now)).toBe(0);
    expect(remainingTiffinCount(9, 3, rows, now)).toBe(9);
  });
});
