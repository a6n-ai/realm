import { describe, expect, it } from "vitest";
import {
  axisTicks,
  moneyTick,
  tickEvery,
  truncateLabel,
  foldParts,
  funnelStages,
  heatBucket,
  heatIsDense,
  positionalConfig,
  rankedHeight,
  topWithOther,
} from "../chart-math";

describe("foldParts", () => {
  const parts = Array.from({ length: 9 }, (_, i) => ({ label: `p${i}`, value: i + 1 }));
  it("folds more than 5 into Other and shares sum to 100", () => {
    const out = foldParts(parts);
    expect(out).toHaveLength(5);
    expect(out.at(-1)).toMatchObject({ label: "Other", value: 1 + 2 + 3 + 4 + 5 });
    expect(new Set(out.slice(0, 4).map((p) => p.color)).size).toBe(4);
    expect(out.reduce((s, p) => s + p.share, 0)).toBe(100);
    expect(out.reduce((s, p) => s + p.value, 0)).toBe(45);
  });
  it("shares sum to 100 on awkward thirds and status tones map to tokens", () => {
    const out = foldParts([
      { label: "a", value: 1, tone: "success" },
      { label: "b", value: 1, tone: "destructive" },
      { label: "c", value: 1 },
    ]);
    expect(out.reduce((s, p) => s + p.share, 0)).toBe(100);
    expect(out.map((p) => p.color)).toEqual(["var(--success)", "var(--destructive)", "var(--chart-1)"]);
  });
  it("skips the red chart-4 when status colours are present", () => {
    const out = foldParts([
      { label: "ok", value: 5, tone: "success" },
      ...["a", "b", "c", "d"].map((label) => ({ label, value: 1 })),
    ]);
    expect(out.map((p) => p.color)).not.toContain("var(--chart-4)");
  });
  it("is empty for all-zero input", () => {
    expect(foldParts([{ label: "a", value: 0 }])).toEqual([]);
  });
});

describe("funnelStages", () => {
  it("keeps order and computes % kept from the previous stage", () => {
    const s = funnelStages([
      { label: "Lead", value: 200 },
      { label: "Trial", value: 50 },
      { label: "Plan", value: 20 },
    ]);
    expect(s.map((x) => x.label)).toEqual(["Lead", "Trial", "Plan"]);
    expect(s.map((x) => x.kept)).toEqual([null, 25, 40]);
    expect(s.map((x) => x.width)).toEqual([100, 25, 10]);
  });
  it("survives a zero previous stage", () => {
    expect(funnelStages([{ label: "a", value: 0 }, { label: "b", value: 3 }])[1]!.kept).toBeNull();
  });
});

describe("heatBucket", () => {
  it("is 0 for empty, 1 at min, max bucket at max", () => {
    expect(heatBucket(0, 10, 100)).toBe(0);
    expect(heatBucket(null, 10, 100)).toBe(0);
    expect(heatBucket(10, 10, 100)).toBe(1);
    expect(heatBucket(100, 10, 100)).toBe(5);
    expect(heatBucket(5, 5, 5)).toBe(5);
    expect(heatIsDense(heatBucket(100, 10, 100))).toBe(true);
    expect(heatIsDense(heatBucket(10, 10, 100))).toBe(false);
  });
});

describe("topWithOther", () => {
  it("keeps top 8 plus Other and preserves the sum", () => {
    const rows = Array.from({ length: 12 }, (_, i) => ({ name: `r${i}`, n: i + 1 }));
    const out = topWithOther(rows, "name", "n");
    expect(out).toHaveLength(9);
    expect(out.at(-1)).toMatchObject({ name: "Other", n: 1 + 2 + 3 + 4 });
    expect(out.reduce((s, r) => s + Number(r.n), 0)).toBe(78);
  });
  it("shows a single leftover row instead of folding it", () => {
    const rows = Array.from({ length: 9 }, (_, i) => ({ name: `r${i}`, n: i + 1 }));
    const out = topWithOther(rows, "name", "n");
    expect(out).toHaveLength(9);
    expect(out.map((r) => r.name)).not.toContain("Other");
    expect(out[0]!.n).toBe(9);
  });
  it("leaves short lists alone", () => {
    expect(topWithOther([{ name: "a", n: 1 }], "name", "n")).toHaveLength(1);
  });
});

describe("rankedHeight", () => {
  it("is rows x 36 with a 3-row minimum", () => {
    expect(rankedHeight(1)).toBe(108);
    expect(rankedHeight(8)).toBe(288);
  });
});

describe("positionalConfig", () => {
  it("never derives keys from names", () => {
    const cfg = positionalConfig([{ label: "x</style><b>" }, { label: "Veg. Plan" }]);
    expect(Object.keys(cfg)).toEqual(["s0", "s1"]);
    expect(JSON.stringify(Object.keys(cfg))).not.toContain("style");
  });
});

describe("axis helpers", () => {
  it("money axis runs from 0 to a nice max in about five ticks", () => {
    expect(axisTicks(4273)).toEqual([0, 1000, 2000, 3000, 4000, 5000]);
    expect(axisTicks(1548)).toEqual([0, 500, 1000, 1500, 2000]);
    expect(axisTicks(0)).toEqual([0, 1]);
  });
  it("count axes only land on whole numbers", () => {
    expect(axisTicks(15, true)).toEqual([0, 5, 10, 15]);
    expect(axisTicks(1, true)).toEqual([0, 1]);
    expect(axisTicks(2, true).every(Number.isInteger)).toBe(true);
    expect(axisTicks(265, true).at(-1)).toBeGreaterThanOrEqual(265);
  });
  it("compact money labels", () => {
    expect(moneyTick(0)).toBe("$0");
    expect(moneyTick(500)).toBe("$500");
    expect(moneyTick(1000)).toBe("$1k");
    expect(moneyTick(1500)).toBe("$1.5k");
    expect(moneyTick(12000)).toBe("$12k");
    expect(moneyTick(-2000)).toBe("-$2k");
  });
  it("labels about every 4th day on a month and every day on a short range", () => {
    expect(tickEvery(30)).toBe(3);
    expect(tickEvery(7)).toBe(0);
  });
  it("truncates long names to 18 characters", () => {
    expect(truncateLabel("Short")).toBe("Short");
    expect(truncateLabel("Maharaja Thali with extras")).toHaveLength(18);
  });
});
