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
const agendaOf = (...e: [string, string, "scheduled" | "skipped"][]): Agenda => {
  const a: Agenda = {};
  for (const [d, orderId, status] of e) (a[d] ??= []).push({ orderId, status, cutoffAt: cut, deliveryDate: d, truck: true, units: 1, covers: [d] });
  return a;
};
const view = (sel: string | null = "2026-09-23", t = trips, p = plan, extra: Partial<React.ComponentProps<typeof DeliveriesView>> = {}) =>
  render(<DeliveriesView plans={[p]} windows={{}} trips={t} agenda={{}} weekStart="2026-09-21" lastWeek="2026-10-05" now={NOW} initialTrip={sel} initialPlan={null} initialFilter={null} {...extra} />);

const p1 = mk("o1", { size: "Large", remaining: 16, total: 20 });
const p2 = mk("o2", { size: "Small", remaining: 8, total: 10 });
const twoPlans = [
  trip({ orderId: "o1", date: "2026-09-23", deliveryId: "a" }),
  trip({ orderId: "o2", date: "2026-09-23", deliveryId: "b", units: 3, eatingDays: [{ date: "2026-09-23", dishSummary: "Chole", swaps: [], locksWith: null }] }),
  trip({ orderId: "o1", date: "2026-09-24", status: "hold" }),
];
const twoAgenda = agendaOf(["2026-09-23", "o1", "scheduled"], ["2026-09-23", "o2", "scheduled"], ["2026-09-24", "o1", "skipped"], ["2026-09-30", "o1", "scheduled"], ["2026-10-07", "o2", "scheduled"]);
const multi = (over: Partial<React.ComponentProps<typeof DeliveriesView>> = {}) =>
  render(<DeliveriesView plans={[p1, p2]} windows={{ o1: { first: "2026-09-01", last: "2026-09-30", next: "2026-09-23" }, o2: { first: "2026-10-07", last: "2026-10-30", next: "2026-10-07" } }} trips={twoPlans} agenda={twoAgenda} weekStart="2026-09-21" lastWeek="2026-10-05" now={NOW} initialTrip="2026-09-23" initialPlan={null} initialFilter={null} {...over} />);

describe("DeliveriesView (single plan)", () => {
  it("shows plan summary with tiffin counts, hold days and status pills", () => {
    view();
    const line = screen.getByText(/16 of 20 tiffins left/).closest("p")!;
    expect(line).toHaveTextContent("Large");
    expect(line).toHaveTextContent("2 hold days");
    expect(line).toHaveTextContent("renews in 11 days");
  });
  it("selected trip detail lists eating-day dishes", () => {
    view();
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Arrives Wed, Sep 23");
    expect(screen.getAllByText("Paneer, Jeera Rice").length).toBeGreaterThan(0);
  });
  it("opens the pick sheet in one click", () => {
    view();
    fireEvent.click(screen.getAllByRole("button", { name: /Pick meals/ })[0]!);
    expect(screen.getByRole("dialog", { name: "Pick meals" })).toBeInTheDocument();
  });
  it("held trip: Resume is offered, Hold is not", () => {
    view("2026-09-25");
    expect(screen.getAllByRole("button", { name: /Resume this trip/ }).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Hold this trip/ })).toBeNull();
  });
  it("delivered trip: no action rows", () => {
    view("2026-09-21");
    expect(screen.queryByRole("button", { name: /Pick meals/ })).toBeNull();
  });
  it("selecting another row swaps the detail", () => {
    view();
    fireEvent.click(screen.getAllByRole("button", { name: /Fri, Sep 25/ })[0]!);
    expect(screen.getAllByRole("heading", { name: /Fri, Sep 25/ }).length).toBeGreaterThan(0);
  });
  it("pool banner opens the make-up sheet", () => {
    view("2026-09-23", trips, mk("o", { size: "Large", remaining: 16, total: 20, pooled: 3 }));
    fireEvent.click(screen.getByRole("button", { name: "Schedule a make-up" }));
    expect(screen.getByRole("dialog", { name: "Schedule a make-up" })).toBeInTheDocument();
  });
  it("merged trip with repeated dishes renders without duplicate-key warnings", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const day = (date: string) => ({ date, dishSummary: "Bhindi Masala, Bhindi Masala", swaps: [], locksWith: null });
    view("2026-09-23", [trip({ eatingDays: [day("2026-09-23"), day("2026-09-24")], units: 2 })]);
    expect(err.mock.calls.filter((c) => String(c[0]).includes("same key"))).toEqual([]);
    expect(screen.getAllByText("Bhindi Masala ×2").length).toBeGreaterThanOrEqual(2);
    err.mockRestore();
  });
  it("a merged source day has no row and folds into its target's covers line", () => {
    const t = [
      trip({ date: "2026-09-23", status: "combined-into", mergedInto: "2026-09-24", eatingDays: [] }),
      trip({ date: "2026-09-24", units: 2, coversLabel: "Covers Wed + Thu", coversDates: ["2026-09-23", "2026-09-24"] }),
    ];
    view("2026-09-23", t);
    expect(screen.getAllByTestId("trip-row")).toHaveLength(2);
    expect(screen.getAllByRole("heading", { name: /Wed, Sep 23/ }).length).toBe(1);
  });
  it("?action opens its sheet on load", () => {
    view("2026-09-23", trips, plan, { initialAction: "hold" });
    expect(screen.getByRole("dialog", { name: /^Hold / })).toBeInTheDocument();
  });
  it("shows no earlier/more lists and no month links: the week is the whole list", () => {
    view();
    expect(screen.queryByRole("button", { name: /Show earlier|Show more|See all/ })).toBeNull();
    expect(screen.queryByRole("link", { name: /trips$/ })).toBeNull();
    expect(screen.getAllByTestId("trip-row")).toHaveLength(4);
  });
  it("a trip covering Mon + Tue: Tue names the delivery that feeds it", () => {
    view("2026-09-22");
    expect(screen.getByRole("heading", { name: /Tue, Sep 22/ })).toBeInTheDocument();
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Delivered Mon, Sep 21");
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("2 tiffins covering Mon, Tue");
  });
});

describe("DeliveriesView (week + several plans)", () => {
  it("both plans delivering the same day each get a row with its own plan tag", () => {
    multi();
    const rows = screen.getAllByTestId("trip-row");
    expect(rows).toHaveLength(3);
    const sep23 = rows.filter((r) => /Wed, Sep 23/.test(r.textContent ?? ""));
    expect(sep23).toHaveLength(2);
    expect(within(sep23[0]!).getByTestId("plan-tag")).toHaveTextContent("Large");
    expect(within(sep23[1]!).getByTestId("plan-tag")).toHaveTextContent("Small");
  });
  it("only the week's trips are listed (trips are week-scoped)", () => {
    multi();
    expect(screen.getAllByTestId("trip-row").some((r) => /Sep 30|Oct 7/.test(r.textContent ?? ""))).toBe(false);
    expect(screen.getAllByRole("heading", { name: "Sep 21 – Sep 27" })).toHaveLength(1);
  });
  it("selecting the second plan's trip shows THAT plan's counts and its own dishes", () => {
    multi();
    fireEvent.click(screen.getByRole("button", { name: /Wed, Sep 23, Small/ }));
    expect(screen.getByText(/8 of 10 tiffins left/)).toBeInTheDocument();
    expect(screen.getAllByText("Chole").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /Wed, Sep 23, Large/ }));
    expect(screen.getByText(/16 of 20 tiffins left/)).toBeInTheDocument();
  });
  it("plan filter chips narrow the list and the strip dots", () => {
    multi();
    const day = () => screen.getByRole("button", { name: /Wednesday, September 23/ });
    expect(day().getAttribute("aria-label")).toContain("Upcoming, Upcoming, delivery arrives");
    fireEvent.click(screen.getByRole("button", { name: /^Small/ }));
    expect(screen.getAllByTestId("trip-row")).toHaveLength(1);
    expect(day().getAttribute("aria-label")).not.toContain("Upcoming, Upcoming");
    fireEvent.click(screen.getByRole("button", { name: "All plans" }));
    expect(screen.getAllByTestId("trip-row")).toHaveLength(3);
  });
  it("?sub pre-filters to one plan", () => {
    multi({ initialFilter: "o2", initialPlan: "o2" });
    expect(screen.getAllByTestId("trip-row")).toHaveLength(1);
  });
  it("strip lists a dot per plan for every day in range, even other weeks", () => {
    multi();
    expect(screen.getByRole("button", { name: /Wednesday, September 30, eating, Upcoming/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Wednesday, October 7, eating, Upcoming/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Saturday, September 26, nothing planned/ })).toBeInTheDocument();
  });
  it("tapping a day in another week changes the ?week param via router.replace", () => {
    replace.mockClear();
    multi();
    fireEvent.click(screen.getByRole("button", { name: /Wednesday, October 7/ }));
    expect(replace).toHaveBeenCalledTimes(1);
    expect(replace.mock.calls[0]![0]).toContain("week=2026-10-05");
    expect(replace.mock.calls[0]![0]).toContain("trip=2026-10-07");
  });
  it("tapping a no-delivery day in the week says so", () => {
    multi();
    fireEvent.click(screen.getByRole("button", { name: /Saturday, September 26/ }));
    expect(screen.getByText("Nothing planned on Sat, Sep 26.")).toBeInTheDocument();
  });
  it("empty week: names the next delivery with a Go to button", () => {
    replace.mockClear();
    multi({ trips: [], weekStart: "2026-10-12", initialTrip: null });
    expect(screen.getByText(/Nothing to eat this week/)).toBeInTheDocument();
    const go = screen.getByRole("button", { name: "Go to Wed, Oct 7" });
    fireEvent.click(go);
    expect(replace.mock.calls[0]![0]).toContain("week=2026-10-05");
  });
  it("Next delivery card lists the earliest arriving trip per plan with tiffins, covers and cutoff", () => {
    multi();
    const card = screen.getByTestId("next-delivery");
    expect(card).toHaveTextContent("Next delivery: Wed, Sep 23, 1 tiffin (Wed)");
    expect(within(card).getAllByRole("button")).toHaveLength(2);
    expect(card).toHaveTextContent(/Changes close/);
  });
  it("the info button on a row explains the trip: status, delivery day, feeds, cutoff", () => {
    multi();
    fireEvent.click(screen.getByRole("button", { name: /Details for Thu, Sep 24, Large/ }));
    const d = screen.getByRole("dialog", { name: /Thu, Sep 24 · trip details/ });
    expect(within(d).getByText(/On hold\. Nothing arrives/)).toBeInTheDocument();
    expect(within(d).getByText("Delivery day")).toBeInTheDocument();
    expect(within(d).getByText("Feeds")).toBeInTheDocument();
    expect(within(d).getByText("Plan")).toBeInTheDocument();
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
