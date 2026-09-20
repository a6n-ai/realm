// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DateStrip, MonthGrid, Segmented, StatusDot, Tabs, formatRelative } from "..";

afterEach(cleanup);

const items = [{ id: "a", label: "Mon" }, { id: "b", label: "Tue" }, { id: "c", label: "Wed" }];
function Harness() {
  const [v, setV] = useState("a");
  return <Tabs label="Days" items={items} value={v} onChange={setV} />;
}

describe("Tabs", () => {
  it("uses roving tabindex and arrow keys select", () => {
    render(<Harness />);
    expect(screen.getByRole("tablist", { name: "Days" })).toBeInTheDocument();
    const [a, b, c] = screen.getAllByRole("tab");
    expect(a).toHaveAttribute("tabindex", "0");
    expect(b).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(a, { key: "ArrowRight" });
    expect(b).toHaveAttribute("aria-selected", "true");
    expect(b).toHaveAttribute("tabindex", "0");
    expect(document.activeElement).toBe(b);
    fireEvent.keyDown(b, { key: "End" });
    expect(c).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(c, { key: "ArrowRight" });
    expect(a).toHaveAttribute("aria-selected", "true");
  });
  it("Segmented renders the same semantics", () => {
    render(<Segmented label="View" items={items} value="b" onChange={() => {}} />);
    expect(screen.getByRole("tab", { name: "Tue" })).toHaveAttribute("aria-selected", "true");
  });
});

describe("DateStrip", () => {
  it("disabled cell is aria-disabled, shows its reason on tap, never selects", () => {
    const onChange = vi.fn();
    render(<DateStrip label="Pick" value={null} onChange={onChange} days={[
      { date: "2026-09-22" }, { date: "2026-09-23", disabledReason: "Already a delivery" },
    ]} />);
    const cell = screen.getByRole("button", { name: /23/ });
    expect(cell).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(cell);
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("status")).toHaveTextContent("Already a delivery");
    fireEvent.click(screen.getByRole("button", { name: /22/ }));
    expect(onChange).toHaveBeenCalledWith("2026-09-22");
  });
});

describe("MonthGrid", () => {
  it("is a grid with roving tabindex and arrow navigation", () => {
    const onSelect = vi.fn();
    render(<MonthGrid month="2026-09" selected="2026-09-21" onSelect={onSelect} days={{ "2026-09-21": { status: "delivered" } }} />);
    expect(screen.getByRole("grid")).toBeInTheDocument();
    const d21 = screen.getByRole("button", { name: /September 21/ });
    expect(d21).toHaveAttribute("tabindex", "0");
    expect(d21).toHaveAttribute("aria-pressed", "true");
    fireEvent.keyDown(d21, { key: "ArrowRight" });
    const d22 = screen.getByRole("button", { name: /September 22/ });
    expect(document.activeElement).toBe(d22);
    expect(d22).toHaveAttribute("tabindex", "0");
    expect(d21).toHaveAttribute("tabindex", "-1");
    fireEvent.keyDown(d22, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: /September 29/ }));
    fireEvent.click(document.activeElement!);
    expect(onSelect).toHaveBeenCalledWith("2026-09-29");
  });
});

describe("StatusDot / formatRelative", () => {
  it("labels status in text for assistive tech", () => {
    render(<StatusDot status="hold" />);
    expect(screen.getByRole("img", { name: "On hold" })).toBeInTheDocument();
  });
  it("formats relative time", () => {
    expect(formatRelative(125 * 60_000)).toBe("in 2h 5m");
    expect(formatRelative(-5 * 60_000)).toBe("passed");
    expect(formatRelative(30 * 60 * 60_000)).toBe("in 1d 6h");
  });
});
