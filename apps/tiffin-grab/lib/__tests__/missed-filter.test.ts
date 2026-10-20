import { describe, expect, it } from "vitest";
import { filterMissedRows } from "../missed-filter";
import type { MissedDeliveryRow } from "@/lib/services/missed-deliveries.service";

const row = (over: Partial<MissedDeliveryRow>): MissedDeliveryRow => ({
  deliveryPublicId: "dlv_1", deliveryDate: "2026-10-19", tiffinUnits: 1, kind: "not_sent", driver: null,
  orderPublicId: "ord_1", orderCode: "SUB-B5RRV3", customerName: "Arvindkumar Yadav", planName: "Pure Vegetarian Plan",
  ...over,
});

const rows = [
  row({ deliveryPublicId: "a" }),
  row({ deliveryPublicId: "b", kind: "no_confirmation", deliveryDate: "2026-10-12", customerName: "Ram", orderCode: "SUB-UNX4ZV" }),
  row({ deliveryPublicId: "c", deliveryDate: "2026-09-10", customerName: "Monil", orderCode: "SUB-6VA8MT" }),
];
const ids = (f: Parameters<typeof filterMissedRows>[1]) => filterMissedRows(rows, f, "2026-10-20").map((r) => r.deliveryPublicId);

describe("filterMissedRows", () => {
  it("keeps everything with no filter, including last month", () => expect(ids({})).toEqual(["a", "b", "c"]));
  it("filters by why", () => expect(ids({ why: "no_confirmation" })).toEqual(["b"]));
  it("counts days back from today", () => {
    expect(ids({ day: "1" })).toEqual(["a"]);
    expect(ids({ day: "7" })).toEqual(["a"]);
    expect(ids({ day: "30" })).toEqual(["a", "b"]);
  });
  it("ignores an unknown day value", () => expect(ids({ day: "abc" })).toEqual(["a", "b", "c"]));
  it("searches customer and order code, case-insensitive", () => {
    expect(ids({ q: "sub-unx" })).toEqual(["b"]);
    expect(ids({ q: "monil" })).toEqual(["c"]);
  });
  it("combines filters", () => expect(ids({ why: "not_sent", day: "30", q: "yadav" })).toEqual(["a"]));
});
