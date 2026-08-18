import { describe, expect, it } from "vitest";
import { deliveredTiffinCount, remainingTiffinCount, type DeliveryForCounts } from "../tiffin-counts";

const past = 1;
const future = Date.now() + 1e9;
const now = Date.now();

function row(over: Partial<DeliveryForCounts>): DeliveryForCounts {
  return { status: "scheduled", cutoffAt: future, makeupForDeliveryId: null, pooledAt: null, tiffinUnits: 1, ...over };
}

describe("tiffin-counts", () => {
  it("sums past-cutoff scheduled rows' tiffinUnits as delivered", () => {
    const rows = [row({ cutoffAt: past, tiffinUnits: 2 }), row({ cutoffAt: future, tiffinUnits: 2 })];
    expect(deliveredTiffinCount(rows, now)).toBe(2);
    expect(remainingTiffinCount(10, rows, now)).toBe(8);
  });

  it("counts a past-cutoff makeup row (still scheduled) as delivered", () => {
    const rows = [row({ cutoffAt: past, makeupForDeliveryId: 42n })];
    expect(deliveredTiffinCount(rows, now)).toBe(1);
  });

  it("does not count past-cutoff skipped/paused as delivered", () => {
    const rows = [
      row({ status: "skipped", cutoffAt: past, pooledAt: 1 }),
      row({ status: "paused", cutoffAt: past, pooledAt: 1 }),
    ];
    expect(deliveredTiffinCount(rows, now)).toBe(0);
  });

  it("does not count future scheduled or cancelled as delivered", () => {
    const rows = [row({ cutoffAt: future }), row({ status: "cancelled", cutoffAt: past })];
    expect(deliveredTiffinCount(rows, now)).toBe(0);
    expect(remainingTiffinCount(9, rows, now)).toBe(9);
  });

  it("counts a weekend-bundled Friday's higher tiffinUnits, not a flat per-row count", () => {
    // 1 plain weekday (1 unit) + 1 Friday absorbing a Saturday add-on (2 units) = 3 delivered.
    const rows = [row({ cutoffAt: past, tiffinUnits: 1 }), row({ cutoffAt: past, tiffinUnits: 2 })];
    expect(deliveredTiffinCount(rows, now)).toBe(3);
  });

  it("counts a not-yet-cutoff row as delivered once OptimoRoute confirms completion", () => {
    const rows = [row({ cutoffAt: future, optimoCompletionStatus: "success", tiffinUnits: 2 })];
    expect(deliveredTiffinCount(rows, now)).toBe(2);
    expect(remainingTiffinCount(5, rows, now)).toBe(3);
  });

  it("still counts a past-cutoff row as delivered with no OptimoRoute data at all", () => {
    // The pull is nightly-cron-only, not real-time — most rows have no completion data yet
    // when a customer checks their count, so the cutoff-passed proxy must keep working.
    const rows = [row({ cutoffAt: past, optimoCompletionStatus: null })];
    expect(deliveredTiffinCount(rows, now)).toBe(1);
  });
});
