import { describe, expect, it } from "vitest";
import { swapsForDay } from "../trip-meals";

const trip = { id: 1n, deliveryDate: "2030-01-07" };
const swap = (deliveryId: bigint, forDate: string | null) => ({ deliveryId, forDate, tag: `${deliveryId}-${forDate}` });

describe("swapsForDay", () => {
  it("NULL for_date belongs to the trip's own date only", () => {
    const swaps = [swap(1n, null), swap(1n, "2030-01-08")];
    expect(swapsForDay(swaps, trip, "2030-01-07").map((s) => s.tag)).toEqual(["1-null"]);
    expect(swapsForDay(swaps, trip, "2030-01-08").map((s) => s.tag)).toEqual(["1-2030-01-08"]);
  });

  it("ignores swaps of other deliveries", () => {
    expect(swapsForDay([swap(2n, null)], trip, "2030-01-07")).toEqual([]);
  });
});
