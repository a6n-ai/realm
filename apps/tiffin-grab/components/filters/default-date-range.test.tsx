// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { presetRange } from "@/lib/analytics/date-presets";

const TZ = "America/Toronto";
const h = vi.hoisted(() => ({ nav: vi.fn(), search: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/orders",
  useSearchParams: () => new URLSearchParams(h.search),
}));
vi.mock("@/components/ds", () => ({ useListNav: () => h.nav }));
vi.mock("@foundry/design-system/timezone-provider", () => ({ useTimezone: () => TZ }));

import { DefaultDateRange } from "./default-date-range";

const NOW = Date.parse("2026-11-20T17:00:00Z");

beforeAll(() => {
  HTMLElement.prototype.showPopover = function () {};
  HTMLElement.prototype.hidePopover = function () {};
  Element.prototype.getAnimations = () => [];
  Element.prototype.scrollIntoView = function () {};
  Element.prototype.checkVisibility = () => true;
  Element.prototype.getClientRects = () => [] as unknown as DOMRectList;
  document.elementFromPoint = () => null;
  document.elementsFromPoint = () => [];
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  document.head.append(
    Object.assign(document.createElement("style"), { textContent: "[popover][data-open] { display: block !important }" }),
  );
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  h.nav.mockReset();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const month = presetRange("this-month", TZ, NOW);
const query = (r: { from: number; to: number }) => `from=${r.from}&to=${r.to}`;

describe("DefaultDateRange", () => {
  it("is one group: a preset trigger with the active preset and the range trigger", () => {
    h.search = query(month);
    render(<DefaultDateRange />);
    const group = screen.getByRole("group", { name: "Date range" });
    expect(within(group).getByRole("combobox", { name: "Date presets" })).toHaveTextContent("This month");
    expect(within(group).getByRole("button", { name: "Nov 1 – Nov 30, 2026" })).toBeInTheDocument();
  });

  it("shows Custom when the range matches no preset", () => {
    h.search = query({ from: month.from + 86_400_000, to: month.to });
    render(<DefaultDateRange />);
    expect(screen.getByRole("combobox", { name: "Date presets" })).toHaveTextContent("Custom");
  });

  it("writes range=last-14 when Last 14 days is chosen", () => {
    h.search = "";
    render(<DefaultDateRange />);
    fireEvent.click(screen.getByRole("combobox", { name: "Date presets" }));
    fireEvent.click(screen.getByRole("option", { name: "Last 14 days" }));
    expect(h.nav).toHaveBeenCalledWith("/dashboard/orders?range=last-14");
  });

  it("clears every date param when This month is chosen", () => {
    h.search = "range=last-14&status=paid";
    render(<DefaultDateRange />);
    fireEvent.click(screen.getByRole("combobox", { name: "Date presets" }));
    fireEvent.click(screen.getByRole("option", { name: "This month" }));
    expect(h.nav).toHaveBeenCalledWith("/dashboard/orders?status=paid");
  });

  it("writes nothing on load and shows This month with no date params", () => {
    h.search = "";
    render(<DefaultDateRange />);
    expect(screen.getByRole("combobox", { name: "Date presets" })).toHaveTextContent("This month");
    expect(h.nav).not.toHaveBeenCalled();
  });

  it("reads range=last-7, ISO dates and a legacy epoch link as the same windows", () => {
    h.search = "range=last-7";
    render(<DefaultDateRange />);
    expect(screen.getByRole("combobox", { name: "Date presets" })).toHaveTextContent("Last 7 days");
    cleanup();
    h.search = "from=2026-11-01&to=2026-11-30";
    render(<DefaultDateRange />);
    expect(screen.getByRole("button", { name: "Nov 1 – Nov 30, 2026" })).toBeInTheDocument();
    cleanup();
    h.search = query(month);
    render(<DefaultDateRange />);
    expect(screen.getByRole("button", { name: "Nov 1 – Nov 30, 2026" })).toBeInTheDocument();
  });

  it("keeps showing All dates for the dates=all drill", () => {
    h.search = "dates=all";
    render(<DefaultDateRange />);
    expect(screen.getByRole("button", { name: /All dates/ })).toBeInTheDocument();
    expect(h.nav).not.toHaveBeenCalled();
  });

  it("still renders the joined control when presets is passed", () => {
    h.search = query(month);
    render(<DefaultDateRange presets />);
    expect(screen.getAllByRole("combobox")).toHaveLength(1);
  });
});
