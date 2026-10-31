import { describe, expect, it } from "vitest";
import { costBreakdown, kpis, type ProfitRow } from "../profitability";
import { buildProfitWaterfall } from "../waterfall";
import { buildSourceFlow } from "../source-flow";

const row = (o: Partial<ProfitRow>): ProfitRow => ({
  date: "2026-10-01", tiffins: 10, revenue: 0, cashCollected: 0, unpaidRevenue: 0,
  kitchen: 0, driver: 0, marketing: 0, salaries: 0, other: 0, costs: 0, profit: 0, marginPct: null, ...o,
});

describe("buildProfitWaterfall", () => {
  it("ends at the stat-card profit: start minus the steps", () => {
    const rows = [
      row({ revenue: 1000.1, kitchen: 300.25, driver: 120.5, marketing: 80, salaries: 200.1, other: 0, costs: 700.85 }),
      row({ date: "2026-10-02", revenue: 500.2, kitchen: 150.1, driver: 60.3, marketing: 80, salaries: 200.1, other: 12.5, costs: 503 }),
    ];
    const k = kpis(rows);
    const w = buildProfitWaterfall(k, costBreakdown(rows));
    expect(w.start.value).toBe(k.revenue);
    expect(w.end.value).toBe(k.profit);
    const running = w.steps.reduce((s, x) => s + x.value, w.start.value);
    expect(running).toBeCloseTo(w.end.value, 2);
    expect(w.steps.every((s) => s.value < 0)).toBe(true);
  });

  it("drops zero-cost steps", () => {
    const rows = [row({ revenue: 100, kitchen: 40, costs: 40 })];
    expect(buildProfitWaterfall(kpis(rows), costBreakdown(rows)).steps.map((s) => s.label)).toEqual(["Kitchen"]);
  });
});

describe("buildSourceFlow", () => {
  const src = (key: string, total: number, converted: number, lost: number) => ({ key, source: key, total, converted, lost });
  it("splits each source into converted, lost and still open, and folds the tail", () => {
    const rows = [src("a", 10, 4, 3), src("b", 8, 8, 0), src("c", 6, 0, 6), src("d", 5, 1, 1), src("e", 4, 0, 0), src("f", 3, 1, 0), src("g", 2, 0, 1)];
    const { nodes, links } = buildSourceFlow(rows);
    expect(nodes.slice(0, 6).map((n) => n.name)).toEqual(["a", "b", "c", "d", "e", "Other"]);
    expect(nodes[5]!.tone).toBe("muted");
    expect(links.reduce((s, l) => s + l.value, 0)).toBe(38);
    const open = links.filter((l) => nodes[l.target]!.name === "Still open").reduce((s, l) => s + l.value, 0);
    expect(open).toBe(3 + 0 + 0 + 3 + 4 + 2 + 1);
  });
  it("omits outcomes nobody reached", () => {
    const { nodes } = buildSourceFlow([src("a", 3, 3, 0)]);
    expect(nodes.map((n) => n.name)).toEqual(["a", "Converted"]);
  });
});
