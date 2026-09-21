// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import { ACTION_SHEETS } from "../actions/registry";
import { DeliveriesView } from "../deliveries-view";
import type { PlanView } from "../adapter";
import type { Agenda } from "@/lib/deliveries-view/week";

vi.mock("@/app/(customer)/me/deliveries/pick-grid", () => ({ loadPickGrid: () => new Promise(() => {}) }));
vi.mock("@/app/(customer)/me/meals/actions", () => ({ pickMyDish: vi.fn(), applyMyDishToWeek: vi.fn() }));
const replace = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace }) }));
afterEach(cleanup);

const NOW = Date.parse("2026-09-21T12:00:00Z");
const trip = (o: Partial<Trip>): Trip => {
  const date = o.date ?? "2026-09-23";
  const covers = o.coversDates ?? [date];
  return {
    orderId: "o", date, deliveryId: "a", units: 1, coversDates: covers, coversLabel: null,
    eatingDays: covers.map((c) => ({ date: c, dishSummary: "Paneer, Jeera Rice", swaps: [], locksWith: c === date ? null : date })),
    status: "upcoming", cutoffAt: NOW + 30 * 3600e3, mergedInto: null, isMakeup: false, pooled: false, rescheduled: false, ...o,
  };
};
const mk = (orderId: string, o: { size: string; remaining: number; total: number; pooled?: number }) =>
  ({
    orderId, today: "2026-09-21", days: [], categoryLabels: {}, categoryPortions: {},
    sub: { publicId: orderId, mealSizeName: o.size, planName: "Veg", tagLabel: "Veg", tagColor: "#2e8b57", status: "active" },
    counts: { total: o.total, delivered: 4, remaining: o.remaining, pooled: o.pooled ?? 0, holdDays: 2, persons: 1, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon"] },
    ctx: { cutoffHour: 18, timezone: "UTC", pooled: o.pooled ?? 0, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon"], active: true },
    pause: { limits: {}, usage: {} },
  }) as unknown as PlanView;
const plan = mk("o", { size: "Large", remaining: 16, total: 20 });
const trips = [
  trip({ date: "2026-09-21", status: "delivered", units: 2, coversLabel: "Covers Mon + Tue", coversDates: ["2026-09-21", "2026-09-22"] }),
  trip({}),
  trip({ date: "2026-09-25", status: "hold" }),
];
const cut = NOW + 30 * 3600e3;
const dot = (orderId: string, deliveryDate: string, covers: string[], units = 1, status: "scheduled" | "skipped" = "scheduled") =>
  covers.map((d) => [d, { orderId, status, cutoffAt: cut, deliveryDate, truck: d === deliveryDate, units, covers }] as const);
const agendaOf = (...e: (readonly [string, Agenda[string][number]])[][]): Agenda => {
  const a: Agenda = {};
  for (const [d, v] of e.flat()) (a[d] ??= []).push(v);
  return a;
};
const view = (sel: string | null = "2026-09-23", t = trips, p = plan, extra: Partial<React.ComponentProps<typeof DeliveriesView>> = {}) =>
  render(<DeliveriesView plan={p} subs={[p.sub]} windows={{}} trips={t} agenda={{}} weekStart="2026-09-21" firstWeek="2026-09-21" lastWeek="2026-10-05" now={NOW} initialTrip={sel} {...extra} />);

const p1 = mk("o1", { size: "Large", remaining: 16, total: 20 });
const p2 = mk("o2", { size: "Small", remaining: 8, total: 10 });
const win = { o1: { first: "2026-09-01", last: "2026-09-30", next: "2026-09-21" }, o2: { first: "2026-10-07", last: "2026-10-30", next: "2026-10-07" } };
const monTrip = trip({ orderId: "o1", date: "2026-09-21", deliveryId: "a", units: 2, coversDates: ["2026-09-21", "2026-09-22"] });
const plan1Trips = [monTrip, trip({ orderId: "o1", date: "2026-09-24", status: "hold" })];
const agenda1 = agendaOf(dot("o1", "2026-09-21", ["2026-09-21", "2026-09-22"], 2), dot("o1", "2026-09-24", ["2026-09-24"], 1, "skipped"), dot("o1", "2026-10-05", ["2026-10-05"]));
const multi = (over: Partial<React.ComponentProps<typeof DeliveriesView>> = {}) =>
  render(<DeliveriesView plan={p1} subs={[p1.sub, p2.sub]} windows={win} trips={plan1Trips} agenda={agenda1} weekStart="2026-09-21" firstWeek="2026-09-21" lastWeek="2026-10-05" now={NOW} initialTrip={null} {...over} />);

describe("DeliveriesView (one plan)", () => {
  it("shows plan summary with tiffin counts, hold days and renew", () => {
    view();
    const line = screen.getByText(/16 of 20 tiffins left/).closest("p")!;
    expect(line).toHaveTextContent("Large");
    expect(line).toHaveTextContent("2 hold days");
    expect(line).toHaveTextContent("renews in 11 days");
  });
  it("selected eating day lists dishes and a compact delivery line", () => {
    view();
    expect(screen.getAllByText("Paneer, Jeera Rice").length).toBeGreaterThan(0);
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Arrives Wed, Sep 23");
  });
  it("Pick meals on the eating day opens the pick sheet in one click", () => {
    view();
    fireEvent.click(screen.getAllByRole("button", { name: /Pick meals/ })[0]!);
    expect(screen.getByRole("dialog", { name: "Pick meals" })).toBeInTheDocument();
  });
  it("there is no Hold action; held trip offers Resume", () => {
    view();
    expect(screen.queryByRole("button", { name: /Hold this trip/ })).toBeNull();
    cleanup();
    view("2026-09-25");
    expect(screen.getAllByRole("button", { name: /Resume this trip/ }).length).toBeGreaterThan(0);
  });
  it("delivered eating day: no action rows", () => {
    view("2026-09-21");
    expect(screen.queryByRole("button", { name: /Pick meals/ })).toBeNull();
  });
  it("a trip covering Mon + Tue: Tue names the delivery that feeds it", () => {
    view("2026-09-22");
    expect(screen.getByRole("heading", { name: /Tue, Sep 22/ })).toBeInTheDocument();
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Delivered Mon, Sep 21");
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("2 tiffins covering Mon, Tue");
  });
  it("selecting another row swaps the detail; rows show no delivery text, just date, dishes, status", () => {
    view();
    fireEvent.click(screen.getAllByRole("button", { name: /Fri, Sep 25/ })[0]!);
    expect(screen.getAllByRole("heading", { name: /Fri, Sep 25/ }).length).toBeGreaterThan(0);
    expect(within(screen.getAllByTestId("trip-row")[0]!).queryByText(/Arrives|Delivered Mon/)).toBeNull();
  });
  it("pool banner opens the make-up sheet", () => {
    view("2026-09-23", trips, mk("o", { size: "Large", remaining: 16, total: 20, pooled: 3 }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule a make-up" }));
    expect(screen.getByRole("dialog", { name: "Schedule a make-up" })).toBeInTheDocument();
  });
  it("repeated dishes render without duplicate-key warnings", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const day = (date: string) => ({ date, dishSummary: "Bhindi Masala, Bhindi Masala", swaps: [], locksWith: null });
    view("2026-09-23", [trip({ eatingDays: [day("2026-09-23"), day("2026-09-24")], units: 2, coversDates: ["2026-09-23", "2026-09-24"] })]);
    expect(err.mock.calls.filter((c) => String(c[0]).includes("same key"))).toEqual([]);
    expect(screen.getAllByText("Bhindi Masala ×2").length).toBeGreaterThanOrEqual(2);
    err.mockRestore();
  });
  it("?action opens its sheet on load", () => {
    view("2026-09-23", trips, plan, { initialAction: "hold" });
    expect(screen.getByRole("dialog", { name: /^Hold / })).toBeInTheDocument();
  });
  it("the week is the whole list: no earlier/more/month links", () => {
    view();
    expect(screen.queryByRole("button", { name: /Show earlier|Show more|See all/ })).toBeNull();
    expect(screen.getAllByTestId("trip-row")).toHaveLength(4);
  });
});

describe("DeliveriesView (week, plans on top, delivery info)", () => {
  it("plan tabs on top; only the selected plan's eating days are listed; no 'All plans'", () => {
    multi();
    const nav = screen.getByRole("navigation", { name: "Your plans" });
    expect(within(nav).getAllByRole("button")).toHaveLength(2);
    expect(within(nav).queryByText(/All plans/)).toBeNull();
    expect(screen.getAllByTestId("trip-row")).toHaveLength(3);
  });
  it("switching plan reloads with ?sub", () => {
    replace.mockClear();
    multi();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Your plans" })).getByRole("button", { name: /Small/ }));
    expect(replace.mock.calls[0]![0]).toBe("/me?sub=o2");
  });
  it("strip marks the delivery day with a truck; other eating days have none", () => {
    multi();
    const strip = within(screen.getByTestId("week-strip"));
    expect(strip.getByRole("button", { name: /Monday, September 21, eating, Upcoming, delivery arrives/ })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: /Tuesday, September 22, eating, Upcoming$/ })).toBeInTheDocument();
  });
  it("delivery section shows the next delivery by default and the tapped day's delivery once selected", () => {
    multi();
    expect(screen.getByTestId("next-delivery")).toHaveTextContent("Next delivery: Mon, Sep 21, 2 tiffins (Mon + Tue)");
    fireEvent.click(within(screen.getByTestId("week-strip")).getByRole("button", { name: /Tuesday, September 22/ }));
    expect(screen.getByTestId("next-delivery")).toHaveTextContent("Arrives Mon, Sep 21 with Mon");
  });
  it("tapping a day in another week updates ?week via router.replace", () => {
    replace.mockClear();
    multi();
    fireEvent.click(within(screen.getByTestId("week-strip")).getByRole("button", { name: /Monday, October 5/ }));
    expect(replace.mock.calls[0]![0]).toContain("week=2026-10-05");
    expect(replace.mock.calls[0]![0]).toContain("trip=2026-10-05");
  });
  it("tapping a no-delivery day says so", () => {
    multi();
    fireEvent.click(within(screen.getByTestId("week-strip")).getByRole("button", { name: /Saturday, September 26/ }));
    expect(screen.getByText("Nothing planned on Sat, Sep 26.")).toBeInTheDocument();
  });
  it("empty week names the next day with a Go to button", () => {
    replace.mockClear();
    multi({ trips: [], weekStart: "2026-10-12", initialTrip: null });
    expect(screen.getByText(/Nothing to eat this week/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to Mon, Oct 5" }));
    expect(replace.mock.calls[0]![0]).toContain("week=2026-10-05");
  });
  it("info button on a row explains the trip", () => {
    multi();
    fireEvent.click(screen.getByRole("button", { name: /Details for Thu, Sep 24/ }));
    const d = screen.getByRole("dialog", { name: /Thu, Sep 24 · trip details/ });
    expect(within(d).getByText(/On hold\. Nothing arrives/)).toBeInTheDocument();
  });
  it("next arrow moves one week forward", () => {
    replace.mockClear();
    multi();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(replace.mock.calls[0]![0]).toContain("week=2026-09-28");
  });
});

describe("action registry", () => {
  it("maps every TripAction to a sheet component", () => {
    expect(Object.keys(ACTION_SHEETS).sort()).toEqual(["hold", "makeup", "move", "pick", "pool", "resume", "swap", "vacation"]);
  });
});
