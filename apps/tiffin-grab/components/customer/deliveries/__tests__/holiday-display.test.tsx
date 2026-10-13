// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { Agenda } from "@/lib/deliveries-view/week";
import { DeliveriesView } from "../deliveries-view";
import { MoveSheet } from "../actions/move-sheet";
import type { PlanView } from "../adapter";

vi.mock("@/app/(customer)/me/deliveries/pick-grid", () => ({ loadPickGrid: () => new Promise(() => {}) }));
vi.mock("@/app/(customer)/me/meals/actions", () => ({ pickMyDish: vi.fn() }));
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({ releaseMyDays: vi.fn(), loadMyPauseDays: vi.fn(async () => ({ ok: true, days: [] })), pauseMyDays: vi.fn(), rescheduleMyDelivery: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }) }));
beforeEach(() => vi.spyOn(Date, "now").mockReturnValue(NOW));
afterEach(cleanup);

const NOW = Date.parse("2026-09-21T12:00:00Z");
const LONG_NAME = "Festival of Lights celebrated across the whole city 2026";
const trip = (o: Partial<Trip>): Trip => {
  const date = o.date ?? "2026-09-23";
  return {
    orderId: "o", date, deliveryId: "a", units: 1, coversDates: [date], coversLabel: null,
    eatingDays: [{ date, dishSummary: "Paneer, Jeera Rice", swaps: [], locksWith: null }],
    status: "upcoming", cutoffAt: NOW + 30 * 3600e3, mergedInto: null, isMakeup: false, rescheduled: false, ...o,
  };
};
const plan = {
  orderId: "o", today: "2026-09-21", days: [{ date: "2026-09-28", status: "scheduled", units: 1, covers: ["2026-09-28"] }], categoryLabels: {}, categoryPortions: {}, categoryPortionSlots: {},
  sub: { publicId: "o", mealSizeName: "Large", planName: "Veg", tagLabel: "Veg", tagColor: "#2e8b57", status: "active", displayStatus: "active" },
  counts: { total: 20, delivered: 4, remaining: 16, persons: 1, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"] },
  ctx: { cutoffHour: 18, timezone: "UTC", lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"], active: true, holidays: { "2026-09-28": "Diwali" } },
  pause: { limits: {}, usage: {} },
} as unknown as PlanView;
const holidayDot = (date: string, name: string): Agenda => ({ [date]: [{ orderId: "o", status: "paused", cutoffAt: NOW + 1000, deliveryDate: date, truck: false, units: 1, covers: [date], holiday: name }] });
const view = (t: Trip[], sel: string, agenda: Agenda = {}) =>
  render(<DeliveriesView plan={plan} subs={[plan.sub]} windows={{}} trips={t} agenda={agenda} weekStart="2026-09-21" firstWeek="2026-09-21" lastWeek="2026-10-05" now={NOW} initialTrip={sel} />);

describe("a holiday day on the customer deliveries page", () => {
  it("a closed, placed day reads the holiday name and where it went; no meal, no actions, no Out-to chip", () => {
    view([trip({ status: "holiday", holidayName: LONG_NAME, movedTo: "2026-10-02", holidayExtras: ["2026-10-02"], rescheduled: true })], "2026-09-23", holidayDot("2026-09-23", LONG_NAME));
    const block = screen.getByTestId("delivery-block");
    const note = within(block).getByTestId("holiday-note");
    expect(note).toHaveTextContent(`Holiday: ${LONG_NAME}`);
    expect(note).toHaveTextContent("Added at the end of the plan: Fri, Oct 2");
    expect(note.className).toContain("break-words");
    expect(within(block).getByText("Holiday")).toBeInTheDocument();
    expect(block).not.toHaveTextContent("Your meal");
    expect(screen.queryByTestId("move-pills")).toBeNull();
    expect(screen.queryAllByRole("button", { name: /Move to another day|Resume|Edit meal/ })).toHaveLength(0);
  });

  it("a held day still holding its tiffin says the kitchen was closed, offers Move, and never says Not delivered", () => {
    view([trip({ status: "failed", holidayName: "Thanksgiving", optimoCompletionStatus: null })], "2026-09-23", holidayDot("2026-09-23", "Thanksgiving"));
    const note = screen.getByTestId("holiday-note");
    expect(note).toHaveTextContent("Holiday: Thanksgiving");
    expect(note).toHaveTextContent("The kitchen was closed that day. Move this tiffin to another day.");
    expect(screen.getByTestId("delivery-block")).not.toHaveTextContent("Not delivered");
    expect(screen.getAllByRole("button", { name: /Move to another day/ }).length).toBeGreaterThan(0);
  });

  it("the day's accessible label on the week strip carries the word and the name", () => {
    view([trip({ status: "holiday", holidayName: "Diwali" })], "2026-09-23", holidayDot("2026-09-23", "Diwali"));
    const strip = within(screen.getByTestId("week-timeline"));
    expect(strip.getByRole("button", { name: /Wednesday, September 23, eating, Holiday: Diwali/ })).toBeInTheDocument();
  });

  it("the legend explains Holiday", () => {
    view([trip({})], "2026-09-23");
    fireEvent.click(screen.getByRole("button", { name: "What the colours mean" }));
    expect(screen.getByText("Holiday")).toBeInTheDocument();
  });
});

describe("the Move sheet on a holiday date", () => {
  it("a holiday date cannot be picked and says why when tapped", () => {
    render(<MoveSheet trip={trip({ date: "2026-09-23", units: 1 })} plan={plan} open onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    const mon = screen.getByRole("button", { name: /Monday, September 28/ });
    expect(mon).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(mon);
    expect(screen.getByText("Kitchen is closed on Mon, Sep 28: Diwali.")).toBeInTheDocument();
  });
});
