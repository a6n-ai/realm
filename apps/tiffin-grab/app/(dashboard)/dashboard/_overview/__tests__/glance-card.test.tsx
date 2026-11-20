// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const getOverviewSeries = vi.fn();
vi.mock("@/lib/overview/overview.service", () => ({ getOverviewSeries: (...a: unknown[]) => getOverviewSeries(...a) }));

const { GlanceCard } = await import("../glance-card");

afterEach(cleanup);

const days = Array.from({ length: 14 }, (_, i) => ({
  date: `2026-11-${String(i + 7).padStart(2, "0")}`,
  revenue: 0,
  orders: i + 1,
  tiffins: (i + 1) * 10,
}));

const mount = async () => {
  getOverviewSeries.mockResolvedValue({ days, activePlans: 12, renewal: { rate: 40, prevRate: 36, renewed: 0, ended: 0 } });
  const node = await GlanceCard({ visible: "all", today: "2026-11-20", now: Date.parse("2026-11-20T12:00:00Z"), timeZone: "America/Toronto" });
  return render(node);
};

describe("GlanceCard", () => {
  it("renders the four figures as one divided StatCards card", async () => {
    const { container } = await mount();
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="stat-grid"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-slot="stat-cell"]')).toHaveLength(4);
    for (const label of ["Tiffins today", "Orders this week", "Active plans", "Renewal rate 30d"]) {
      expect(screen.getByText(label)).toBeTruthy();
    }
  });

  it("states the comparison only for figures that have a baseline", async () => {
    await mount();
    expect(screen.getAllByText(/^vs /)).toHaveLength(3);
    expect(screen.getByText("vs same day last week")).toBeTruthy();
    expect(screen.queryByText("No baseline")).toBeNull();
  });

  it("links the three figures that have a list behind them", async () => {
    const { container } = await mount();
    expect(container.querySelectorAll('a[data-slot="stat-cell"]')).toHaveLength(3);
  });
});
