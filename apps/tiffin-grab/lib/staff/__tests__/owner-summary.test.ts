import { describe, it, expect } from "vitest";
import { poolSummary, sharePct } from "../owner-summary";

const m = (publicId: string, name: string, weight = 1) => ({ publicId, name, weight });
const pool = [m("c", "Cy"), m("a", "Ann"), m("b", "Bo")];

describe("poolSummary", () => {
  it("round robin starts at the first by publicId without a cursor", () => {
    expect(poolSummary("order", "round_robin", pool)).toEqual({ lead: "Next order goes to ", name: "Ann", tail: "" });
  });
  it("round robin advances past the cursor and wraps", () => {
    expect(poolSummary("order", "round_robin", pool, "a")?.name).toBe("Bo");
    expect(poolSummary("order", "round_robin", pool, "c")?.name).toBe("Ann");
  });
  it("round robin falls back to first when the cursor left the pool", () => {
    expect(poolSummary("ticket", "round_robin", pool, "zz")?.name).toBe("Ann");
  });
  it("percentage names the top weight and the total", () => {
    const r = poolSummary("inquiry", "percentage", [m("a", "Ann", 1), m("b", "Bo", 2)]);
    expect(r).toEqual({ lead: "", name: "Bo", tail: " gets 2 of every 3 inquiries" });
  });
  it("percentage with equal weights splits evenly", () => {
    expect(poolSummary("order", "percentage", pool)?.lead).toBe("Split evenly");
  });
  it("creator explains itself, even for an empty pool", () => {
    expect(poolSummary("inquiry", "creator", [])?.lead).toBe("Staff who add an inquiry own it. Others go to this pool.");
  });
  it("is null for an empty pool under a rotating strategy", () => {
    expect(poolSummary("order", "round_robin", [])).toBeNull();
  });
});

describe("sharePct", () => {
  it("rounds each share of the total", () => {
    expect(sharePct(2, [{ weight: 1 }, { weight: 2 }])).toBe(67);
    expect(sharePct(1, [])).toBe(0);
  });
});
