// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StatCards, StatCardsSkeleton, statGrid, type StatCardItem } from "../stat-cards";

afterEach(cleanup);

const item = (over: Partial<StatCardItem> = {}): StatCardItem => ({ label: "Orders", value: 12, ...over });
const cellsOf = (container: HTMLElement) => Array.from(container.querySelectorAll<HTMLElement>('[data-slot="stat-cell"]'));
const dotsOf = (container: HTMLElement) => cellsOf(container).map((c) => c.querySelector<HTMLElement>('[data-slot="stat-dot"]'));

describe("StatCards", () => {
  it("renders every item as a cell of one card", () => {
    const items = ["A", "B", "C", "D", "E"].map((label) => item({ label }));
    const { container } = render(<StatCards items={items} />);
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    expect(cellsOf(container)).toHaveLength(5);
  });

  it("renders each label once, with no second mobile strip", () => {
    const { container } = render(<StatCards items={[item({ label: "Orders" })]} />);
    expect(screen.getAllByText("Orders")).toHaveLength(1);
    expect(container.querySelector(".md\\:hidden")).toBeNull();
  });

  it("shows the period line and the delta", () => {
    render(<StatCards items={[item({ label: "Revenue", period: "Last 7 days", delta: { now: 5, before: 3, good: "up" } })]} />);
    expect(screen.getByText("Last 7 days")).toBeInTheDocument();
    expect(screen.getByText("67%")).toBeInTheDocument();
  });

  it("shows a colour dot, cycling the chart palette by position", () => {
    const items = Array.from({ length: 6 }, (_, i) => item({ label: `Card ${i}` }));
    const { container } = render(<StatCards items={items} />);
    const dots = dotsOf(container);
    expect(dots.every(Boolean)).toBe(true);
    expect(dots[0]?.getAttribute("style")).toContain("var(--chart-1)");
    expect(dots[4]?.getAttribute("style")).toContain("var(--chart-5)");
    expect(dots[5]?.getAttribute("style")).toContain("var(--chart-1)");
  });

  it("uses the item colour for its dot", () => {
    const { container } = render(<StatCards items={[item({ color: "var(--chart-3)" })]} />);
    expect(dotsOf(container)[0]?.getAttribute("style")).toContain("var(--chart-3)");
  });

  it("makes the whole cell the link, with no button inside it", () => {
    const { container } = render(<StatCards items={[item({ label: "Overdue", href: "/dashboard/tickets", badge: "Late tickets" })]} />);
    const link = screen.getByRole("link", { name: /Overdue/ });
    expect(link).toHaveAttribute("href", "/dashboard/tickets");
    expect(link).toHaveAttribute("data-slot", "stat-cell");
    expect(link.querySelector("button")).toBeNull();
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
  });

  it("renders no link for an item without href", () => {
    render(<StatCards items={[item()]} />);
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("lays out cols at xl and two columns on phones", () => {
    const items = ["A", "B", "C", "D", "E", "F", "G", "H"].map((label) => item({ label }));
    const { container } = render(<StatCards cols={4} items={items} />);
    const grid = container.querySelector('[data-slot="stat-grid"]');
    expect(grid).toHaveClass("grid-cols-2", "xl:grid-cols-4");
  });
});

describe("StatCardsSkeleton", () => {
  it("mirrors the one-card grid with count cells", () => {
    const { container } = render(<StatCardsSkeleton count={5} cols={4} />);
    expect(container.querySelectorAll('[data-slot="card"]')).toHaveLength(1);
    expect(cellsOf(container)).toHaveLength(5);
  });
});

describe("statGrid", () => {
  const cols = (n: number, p: 3 | 4 | 5 = 4) => statGrid(n, p);
  it("picks column counts that divide the cell count, so no row has an empty slot", () => {
    expect(cols(8).grid).toContain("xl:grid-cols-4");
    expect(cols(5).grid).toContain("xl:grid-cols-5");
    expect(cols(6).grid).toContain("xl:grid-cols-3");
    expect(cols(6).grid).toContain("md:grid-cols-3");
    expect(cols(4).last).toBe("col-span-1 md:col-span-1 xl:col-span-1");
  });
  it("lets the last cell absorb a remainder that no column count divides", () => {
    expect(cols(5).last).toContain("col-span-2");
    expect(cols(5).last).toContain("md:col-span-2");
    expect(cols(7).last).toContain("xl:col-span-2");
  });
});

describe("StatCards delta", () => {
  it("names the comparison next to the change", () => {
    render(<StatCards items={[item({ delta: { now: 110, before: 100, good: "up" }, compareLabel: "previous 7 days" })]} />);
    expect(screen.getByText("10%")).toBeInTheDocument();
    expect(screen.getByText("vs previous 7 days")).toBeInTheDocument();
  });
  it("shows the absolute change when the previous period was zero, and No change for 0 to 0", () => {
    render(<StatCards items={[item({ delta: { now: 5, before: 0, good: "up" } }), item({ label: "Cancelled", delta: { now: 0, before: 0, good: "down" } })]} />);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("No change")).toBeInTheDocument();
  });

  it("renders nothing for no items", () => {
    const { container } = render(<StatCards items={[]} />);
    expect(container.firstChild).toBeNull();
  });});
