// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Agenda, AgendaDot } from "@/lib/deliveries/view/week";
import { deliveryDays, lastTiffinDay, OrderMonthCalendar } from "@/app/(dashboard)/dashboard/orders/[id]/order-week/order-month-calendar";

afterEach(cleanup);

const NOW = Date.UTC(2026, 10, 22, 12);
const dot = (date: string, over: Partial<AgendaDot> = {}): AgendaDot => ({
  orderId: "ord_1", status: "scheduled", cutoffAt: Date.UTC(2027, 0, 1), deliveryDate: date, truck: true, units: 1, covers: [date], ...over,
});
// A Monday drop that covers two days, a day eaten from it, a paused day, and a plan that runs into February.
const agenda: Agenda = {
  "2026-11-23": [dot("2026-11-23", { units: 2, optimoCompletionStatus: "success" })],
  "2026-11-24": [dot("2026-11-23", { truck: false, units: 0 })],
  "2026-11-25": [dot("2026-11-25", { status: "paused" })],
  "2026-12-01": [dot("2026-12-01")],
  "2027-02-03": [dot("2027-02-03")],
};

describe("delivery days", () => {
  it("lists only truck days, in date order, with their tiffins and status", () => {
    expect(deliveryDays(agenda, NOW)).toEqual([
      { date: "2026-11-23", units: 2, status: "delivered" },
      { date: "2026-11-25", units: 1, status: "paused" },
      { date: "2026-12-01", units: 1, status: "upcoming" },
      { date: "2027-02-03", units: 1, status: "upcoming" },
    ]);
  });
  it("finds the last eating day, or null for an empty plan", () => {
    expect(lastTiffinDay(agenda)).toBe("2027-02-03");
    expect(lastTiffinDay({})).toBeNull();
  });
});

describe("OrderMonthCalendar quick actions", () => {
  const setup = () => {
    const onPickDay = vi.fn();
    render(<OrderMonthCalendar agenda={agenda} focus="2026-11-23" selectedDay={null} now={NOW} onPickDay={onPickDay} />);
    return onPickDay;
  };

  it("Last tiffin opens the plan's last day", () => {
    const onPickDay = setup();
    fireEvent.click(screen.getByRole("button", { name: /Last tiffin/ }));
    expect(onPickDay).toHaveBeenCalledWith("2027-02-03");
  });

  it("Delivery days shows only drop days, grouped by month, and picks one", () => {
    const onPickDay = setup();
    fireEvent.click(screen.getByRole("button", { name: "Delivery days" }));
    const list = screen.getByRole("listbox", { name: "Delivery days" });
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual([
      expect.stringContaining("Mon, Nov 23"),
      expect.stringContaining("Wed, Nov 25"),
      expect.stringContaining("Tue, Dec 1"),
      expect.stringContaining("Wed, Feb 3"),
    ]);
    expect(list).toHaveTextContent("February 2027 · 1 delivery");
    expect(list).not.toHaveTextContent("Nov 24");
    fireEvent.click(screen.getByRole("option", { name: /Dec 1/ }));
    expect(onPickDay).toHaveBeenCalledWith("2026-12-01");
  });
});
