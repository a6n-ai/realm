// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import { ACTION_SHEETS } from "../actions/registry";
import { DeliveriesView } from "../deliveries-view";
import type { PlanView } from "../adapter";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
afterEach(cleanup);

const NOW = Date.parse("2026-09-21T12:00:00Z");
const trip = (o: Partial<Trip>): Trip => ({
  date: "2026-09-23", deliveryId: "a", units: 1, coversDates: ["2026-09-23"], coversLabel: null,
  eatingDays: [{ date: "2026-09-23", dishSummary: "Paneer, Jeera Rice", swaps: [], locksWith: null }],
  status: "upcoming", cutoffAt: NOW + 30 * 3600e3, mergedInto: null, isMakeup: false, pooled: false, rescheduled: false, ...o,
});
const plan = {
  orderId: "o", today: "2026-09-21", days: [], categoryLabels: {}, categoryPortions: {},
  sub: { publicId: "o", mealSizeName: "Large", planName: "Veg", tagLabel: "Veg", tagColor: "#2e8b57", status: "active" },
  counts: { total: 20, delivered: 4, remaining: 16, pooled: 0, holdDays: 2, persons: 1, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon"] },
  ctx: { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon"], active: true },
  pause: { limits: {}, usage: {} },
} as unknown as PlanView;
const trips = [
  trip({ date: "2026-09-21", status: "delivered", units: 2, coversLabel: "Covers Mon + Tue", coversDates: ["2026-09-21", "2026-09-22"], eatingDays: [] }),
  trip({}),
  trip({ date: "2026-09-25", status: "hold" }),
];
const view = (sel: string | null = "2026-09-23", t = trips, p = plan) =>
  render(<DeliveriesView plan={p} subs={[p.sub]} trips={t} now={NOW} monthKey="2026-09" initialTrip={sel} />);

describe("DeliveriesView", () => {
  it("shows plan summary with tiffin counts, hold days and status pills", () => {
    view();
    expect(screen.getByText("Large")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText(/16 of 20 tiffins left/)).toHaveTextContent("2 hold days");
    expect(screen.getByText("Renews in 11 days")).toBeInTheDocument();
  });
  it("selected trip detail lists eating-day dishes", () => {
    view();
    expect(screen.getByText("Paneer")).toBeInTheDocument();
    expect(screen.getByText("Jeera Rice")).toBeInTheDocument();
  });
  it("action rail has visible rows for an upcoming trip, opens the pick sheet in one click", () => {
    view();
    fireEvent.click(screen.getAllByRole("button", { name: /Pick meals/ })[0]!);
    expect(screen.getByRole("dialog", { name: "Pick meals" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Choose meals/ })).toHaveAttribute("href", "/me/meals?date=2026-09-23");
  });
  it("held trip: Resume is offered, Hold is not", () => {
    view("2026-09-25");
    expect(screen.getAllByRole("button", { name: /Resume this trip/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Hold this trip/ })).toBeNull();
  });
  it("delivered trip: no action rows, reason is visible", () => {
    view("2026-09-21");
    expect(screen.queryByRole("button", { name: /Pick meals/ })).toBeNull();
    expect(screen.getAllByText(/Delivered/).length).toBeGreaterThan(0);
  });
  it("selecting another trip from the timeline swaps the detail", () => {
    view();
    fireEvent.click(screen.getAllByRole("button", { name: /Fri, Sep 25/ })[0]!);
    expect(screen.getAllByRole("heading", { name: "Fri, Sep 25" }).length).toBeGreaterThan(0);
  });
  it("pool banner opens the make-up sheet", () => {
    view("2026-09-23", trips, { ...plan, ctx: { ...plan.ctx, pooled: 3 } });
    fireEvent.click(screen.getByRole("button", { name: "Schedule a make-up" }));
    expect(screen.getByRole("dialog", { name: "Schedule a make-up" })).toBeInTheDocument();
  });
  it("merged trip with repeated dishes renders without duplicate-key warnings", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const day = (date: string) => ({ date, dishSummary: "Bhindi Masala, Bhindi Masala", swaps: [], locksWith: null });
    view("2026-09-23", [trip({ eatingDays: [day("2026-09-23"), day("2026-09-24")], units: 2 })]);
    expect(err.mock.calls.filter((c) => String(c[0]).includes("same key"))).toEqual([]);
    err.mockRestore();
  });
  it("empty month shows a plain message", () => {
    view(null, []);
    expect(screen.getByText(/No deliveries in September/)).toBeInTheDocument();
  });
});

describe("action registry", () => {
  it("maps every TripAction to a sheet component", () => {
    expect(Object.keys(ACTION_SHEETS).sort()).toEqual(["hold", "makeup", "move", "pick", "pool", "resume", "swap", "vacation"]);
  });
});
