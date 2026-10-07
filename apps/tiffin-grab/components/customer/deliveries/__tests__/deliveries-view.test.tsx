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
vi.mock("@/app/(customer)/me/meals/actions", () => ({ pickMyDish: vi.fn() }));
const replace = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn(), replace }) }));
afterEach(cleanup);

const NOW = Date.parse("2026-09-21T12:00:00Z");
const trip = (o: Partial<Trip>): Trip => {
  const date = o.date ?? "2026-09-23";
  const covers = o.coversDates ?? [date];
  return {
    orderId: "o", date, deliveryId: "a", units: 1, coversDates: covers, coversLabel: null,
    eatingDays: covers.map((c) => ({ date: c, dishSummary: "Paneer, Jeera Rice", swaps: [], locksWith: c === date ? null : date })),
    status: "upcoming", cutoffAt: NOW + 30 * 3600e3, mergedInto: null, isMakeup: false, rescheduled: false, ...o,
  };
};
const mk = (orderId: string, o: { size: string; remaining: number; total: number }) =>
  ({
    orderId, today: "2026-09-21", days: [], categoryLabels: {}, categoryPortions: {}, categoryPortionSlots: {},
    sub: { publicId: orderId, mealSizeName: o.size, planName: "Veg", tagLabel: "Veg", tagColor: "#2e8b57", status: "active", displayStatus: "active" },
    counts: { total: o.total, delivered: 4, remaining: o.remaining, persons: 1, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon"] },
    ctx: { cutoffHour: 18, timezone: "UTC", lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon"], active: true },
    pause: { limits: {}, usage: {} },
  }) as unknown as PlanView;
const plan = mk("o", { size: "Large", remaining: 16, total: 20 });
const trips = [
  trip({ date: "2026-09-21", status: "delivered", units: 2, coversLabel: "Covers Mon + Tue", coversDates: ["2026-09-21", "2026-09-22"] }),
  trip({}),
  trip({ date: "2026-09-25", status: "failed" }),
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
const plan1Trips = [monTrip, trip({ orderId: "o1", date: "2026-09-24", status: "failed" })];
const agenda1 = agendaOf(dot("o1", "2026-09-21", ["2026-09-21", "2026-09-22"], 2), dot("o1", "2026-09-24", ["2026-09-24"], 1, "skipped"), dot("o1", "2026-10-05", ["2026-10-05"]));
const multi = (over: Partial<React.ComponentProps<typeof DeliveriesView>> = {}) =>
  render(<DeliveriesView plan={p1} subs={[p1.sub, p2.sub]} windows={win} trips={plan1Trips} agenda={agenda1} weekStart="2026-09-21" firstWeek="2026-09-21" lastWeek="2026-10-05" now={NOW} initialTrip={null} {...over} />);

describe("DeliveriesView (one plan)", () => {
  it("header: greets by name, bold meal-size title, one summary line (status · plan · tiffins left), renew under it", () => {
    view(undefined, trips, plan, { customerName: "Hrithik Raj" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Hi, Hrithik.");
    expect(screen.getByTestId("plan-title")).toHaveTextContent("Large");
    expect(screen.getByTestId("plan-summary")).toHaveTextContent(/Active.*Veg.*16 of 20 tiffins left/);
    expect(screen.queryByText(/hold day|Vacation/)).toBeNull();
    expect(screen.getByText("Renews in 11 days")).toBeInTheDocument();
  });
  it("header: a custom meal reads 'Custom meal' with its composition underneath", () => {
    const name = "1 Rice + 8 Roti + 1× Veg Raita 8oz + 1× Non-Veg Sabzi 8oz + 1× Veg Sabzi 12oz + 1× Veg Sabzi 8oz";
    const custom = { ...plan, sub: { ...plan.sub, mealSizeName: name, mealSizeCustom: true } } as PlanView;
    view(undefined, trips, custom);
    expect(screen.getByTestId("plan-title")).toHaveTextContent(/^Custom meal$/);
    expect(screen.getByTestId("plan-composition")).toHaveTextContent(name);
  });
  it("the selected day reads as delivery (date + journey), then meal, then destination", () => {
    view();
    const block = within(screen.getByTestId("delivery-block"));
    expect(block.getByRole("heading", { level: 2 })).toHaveTextContent("Wed, Sep 23");
    expect(block.getByRole("img", { name: "Scheduled delivery" })).toBeInTheDocument();
    expect(block.getByText("Your meal")).toBeInTheDocument();
    expect(block.getByText("Paneer")).toBeInTheDocument();
    expect(block.getByText("Jeera Rice")).toBeInTheDocument();
    expect(block.getByText("1 tiffin")).toBeInTheDocument();
  });
  it("Edit meal on the eating day opens the pick sheet in one click", () => {
    view();
    fireEvent.click(screen.getAllByRole("button", { name: /Edit meal/ })[0]!);
    expect(screen.getByRole("dialog", { name: "Edit meal" })).toBeInTheDocument();
  });
  it("payment review: shows claim upload and hides the calendar section", () => {
    const claim = {
      paymentPublicId: "pay_1",
      orderPublicId: "o",
      deploymentId: "TG-1",
      amount: "120.00",
      status: "awaiting_payment" as const,
      methodId: "etransfer",
      methodLabel: "Interac e-Transfer",
      payeeHandle: "pay@tiffingrab.com",
      instructions: "Send with the reference below",
      requireProof: false,
      rejectNote: null,
      referenceHint: "TG-1",
    };
    view("2026-09-23", trips, plan, { locked: true, claimPayment: claim, initialAction: "pick" });
    expect(screen.getByTestId("payment-claim")).toBeInTheDocument();
    expect(screen.getByText("Upload payment screenshot")).toBeInTheDocument();
    expect(screen.queryByTestId("next-delivery")).toBeNull();
    expect(screen.queryByTestId("delivery-block")).toBeNull();
    expect(screen.queryByTestId("trip-row")).toBeNull();
    expect(screen.queryByRole("button", { name: /Edit meal/ })).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("move only: no Hold or Resume anywhere; a failed drop offers Move as its one action", () => {
    view();
    expect(screen.queryByRole("button", { name: /Hold|Resume/ })).toBeNull();
    cleanup();
    view("2026-09-25");
    expect(screen.queryByRole("button", { name: /Hold|Resume|Edit meal/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Move to another day/ }).length).toBeGreaterThan(0);
  });
  it("delivered eating day: no action rows", () => {
    view("2026-09-21");
    expect(screen.queryByRole("button", { name: /Edit meal/ })).toBeNull();
  });
  it("a delivered day carried on Monday's trip just reads Delivered, without trip details", () => {
    view("2026-09-22");
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Tue, Sep 22");
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Delivered Mon, Sep 21 with Mon");
    expect(screen.getByRole("img", { name: "Delivered delivery" })).toBeInTheDocument();
    expect(screen.getByTestId("delivery-block")).not.toHaveTextContent(/tiffins covering/);
  });
  it("picking another day in the week strip swaps the delivery below it", () => {
    view();
    fireEvent.click(within(screen.getByTestId("week-timeline")).getByRole("button", { name: /Friday, September 25/ }));
    expect(screen.getByRole("heading", { level: 2 })).toHaveTextContent("Fri, Sep 25");
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Not delivered");
  });
  it("repeated dishes render without duplicate-key warnings", () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const day = (date: string) => ({ date, dishSummary: "Bhindi Masala, Bhindi Masala", swaps: [], locksWith: null });
    view("2026-09-23", [trip({ eatingDays: [day("2026-09-23"), day("2026-09-24")], units: 2, coversDates: ["2026-09-23", "2026-09-24"] })]);
    expect(err.mock.calls.filter((c) => String(c[0]).includes("same key"))).toEqual([]);
    expect(screen.getAllByText("Bhindi Masala ×2").length).toBeGreaterThanOrEqual(1);
    err.mockRestore();
  });
  it("?action opens its sheet on load", () => {
    view("2026-09-23", trips, plan, { initialAction: "move" });
    expect(screen.getByRole("dialog", { name: /^Move / })).toBeInTheDocument();
  });
  it("the week strip is the navigation: no day list, no earlier/more/month links", () => {
    view();
    expect(screen.queryByRole("button", { name: /Show earlier|Show more|See all/ })).toBeNull();
    expect(screen.queryAllByTestId("trip-row")).toHaveLength(0);
  });
});

describe("DeliveriesView (week, plans on top, delivery info)", () => {
  it("plan tabs on top; only the selected plan's eating days are listed; no 'All plans'", () => {
    multi();
    const nav = screen.getByRole("navigation", { name: "Your plans" });
    expect(within(nav).getAllByRole("button")).toHaveLength(2);
    expect(within(nav).queryByText(/All plans/)).toBeNull();
  });
  it("switching plan reloads with ?sub and refreshes so the new plan's own data isn't served from cache", () => {
    replace.mockClear();
    refresh.mockClear();
    multi();
    fireEvent.click(within(screen.getByRole("navigation", { name: "Your plans" })).getByRole("button", { name: /Small/ }));
    expect(replace.mock.calls[0]![0]).toBe("/me?sub=o2");
    expect(refresh).toHaveBeenCalled();
  });
  it("strip marks the delivery day with a truck; other eating days have none", () => {
    multi();
    const strip = within(screen.getByTestId("week-timeline"));
    expect(strip.getByRole("button", { name: /Monday, September 21, eating, Upcoming, delivery arrives/ })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: /Tuesday, September 22, eating, Upcoming$/ })).toBeInTheDocument();
  });
  it("no separate next-delivery banner; a day carried on another truck names that delivery", () => {
    multi();
    expect(screen.queryByTestId("next-delivery")).toBeNull();
    fireEvent.click(within(screen.getByTestId("week-timeline")).getByRole("button", { name: /Tuesday, September 22/ }));
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Arrives Mon, Sep 21 with Mon");
  });
  it("the next-week arrow updates ?week via router.replace", () => {
    replace.mockClear();
    multi();
    fireEvent.click(within(screen.getByTestId("week-timeline")).getByRole("button", { name: "Next week" }));
    expect(replace.mock.calls[0]![0]).toContain("week=2026-09-28");
  });
  it("a moved bundle shows on the Friday it arrives, not as nothing planned", () => {
    const arriving = trip({
      date: "2026-09-25",
      units: 3,
      coversDates: ["2026-09-18", "2026-09-19", "2026-09-20"],
      coversLabel: "Covers Fri + Sat + Sun",
    });
    view("2026-09-25", [arriving]);
    expect(screen.queryByText("Nothing planned on Fri, Sep 25.")).toBeNull();
    expect(screen.getByText("Fri, Sep 18")).toBeInTheDocument();
    expect(screen.getByTestId("delivery-block")).toHaveTextContent("Arrives Fri, Sep 25");
  });
  it("5-day Mon/Tue/Thu plan: after Thursday moves to Wednesday, only Wednesday shows the truck", () => {
    const mon = "2026-09-28";
    const tue = "2026-09-29";
    const wed = "2026-09-30";
    const thu = "2026-10-01";
    const agenda = agendaOf(dot("o", mon, [mon]), dot("o", tue, [tue]), dot("o", wed, [wed]));
    const moved = [
      trip({ date: mon, coversDates: [mon] }),
      trip({ date: tue, coversDates: [tue] }),
      trip({ date: wed, coversDates: [wed] }),
    ];
    view(thu, moved, plan, { agenda, weekStart: mon, firstWeek: mon, lastWeek: "2026-10-12", initialTrip: thu });
    const strip = within(screen.getByTestId("week-timeline"));
    expect(strip.getByRole("button", { name: /Wednesday, September 30, eating, Upcoming, delivery arrives/ })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: /Monday, September 28, eating, Upcoming, delivery arrives/ })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: /Tuesday, September 29, eating, Upcoming, delivery arrives/ })).toBeInTheDocument();
    expect(strip.getByRole("button", { name: /Thursday, October 1, nothing planned/ })).toBeInTheDocument();
    expect(screen.getByText("Nothing planned on Thu, Oct 1.")).toBeInTheDocument();
  });
  it("tapping a no-delivery day says so", () => {
    multi();
    fireEvent.click(within(screen.getByTestId("week-timeline")).getByRole("button", { name: /Saturday, September 26/ }));
    expect(screen.getByText("Nothing planned on Sat, Sep 26.")).toBeInTheDocument();
  });
  it("empty week names the next day with a Go to button", () => {
    replace.mockClear();
    multi({ trips: [], weekStart: "2026-10-12", initialTrip: null });
    expect(screen.getByText(/Nothing to eat this week/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Go to Mon, Oct 5" }));
    expect(replace.mock.calls[0]![0]).toContain("week=2026-10-05");
  });
  it("meal tiles list each dish with its portion and default pick; no (i) drawer once tiles show", () => {
    const meal = [
      { category: "sabzi", label: "Sabzi", selectable: true, quantity: 2, picks: [
        { dishId: 1n, dishPublicId: "d1", name: "Bhindi Masala", isDefaulted: true },
        { dishId: 1n, dishPublicId: "d1", name: "Bhindi Masala", isDefaulted: true },
      ] },
      { category: "roti", label: "Roti", selectable: false, quantity: 1, picks: [{ dishId: 2n, dishPublicId: "d2", name: "Roti", isDefaulted: false }] },
    ];
    const carried = {
      ...p1,
      categoryPortions: { sabzi: "8oz", roti: "4 roti" },
      categoryPortionSlots: { sabzi: ["12oz", "8oz"], roti: ["4 roti"] },
      days: [{ date: "2026-09-21", menuWeekId: "w1", meal: null, carriedMeals: { "2026-09-22": meal } }],
    } as unknown as PlanView;
    multi({ plan: carried });
    fireEvent.click(within(screen.getByTestId("week-timeline")).getByRole("button", { name: /Tuesday, September 22/ }));
    const tiles = within(screen.getByTestId("meal-tiles"));
    // One tile per item: the two sabzis are two tiles, each with its own portion.
    expect(tiles.getByText("Sabzi · 12oz")).toBeInTheDocument();
    expect(tiles.getByText("Sabzi · 8oz")).toBeInTheDocument();
    expect(tiles.queryByText(/2×|3\s*×/)).toBeNull();
    expect(tiles.getAllByText(/Bhindi Masala/).length).toBe(2);
    expect(tiles.getByText("Roti · 4 roti")).toBeInTheDocument();
    expect(tiles.getAllByText(/Default/).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Details for Tue, Sep 22/ })).toBeNull();
  });
  it("menu not released: days still list with 'Menu not released yet', Pick disabled, Move still works", () => {
    const out = { ...p1, days: [{ date: "2026-09-21", menuWeekId: null, meal: null }, { date: "2026-09-24", menuWeekId: null, meal: null }] } as unknown as PlanView;
    multi({ plan: out, initialTrip: "2026-09-21" });
    expect(screen.getByTestId("menu-not-released")).toHaveTextContent("Menu not released yet.");
    expect(within(screen.getByTestId("delivery-block")).getByText("Menu not released yet")).toBeInTheDocument();
    expect(screen.getByTestId("week-timeline")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /Edit meal/ })[0]!);
    expect(screen.queryByRole("dialog", { name: "Edit meal" })).toBeNull();
    expect(screen.getAllByText("Menu not released yet.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getAllByRole("button", { name: /Move to another day/ })[0]!);
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
  it("menu released as usual: no banner, Pick enabled", () => {
    multi({ initialTrip: "2026-09-21" });
    expect(screen.queryByTestId("menu-not-released")).toBeNull();
  });
  it("no standalone Swap button — exchanges live inside Edit meal", () => {
    const day = (swapPairs: { fromCategory: string; toCategory: string }[]) =>
      ({
        ...p1,
        sub: { ...p1.sub, categoryCounts: { rice: 1 } },
        days: [
          {
            date: "2026-09-21",
            menuWeekId: "w1",
            meal: null,
            eatingDays: [
              { date: "2026-09-21", swapPairs, appliedSwaps: [] },
              { date: "2026-09-22", swapPairs, appliedSwaps: [] },
            ],
          },
        ],
      }) as unknown as PlanView;
    multi({ plan: day([{ fromCategory: "rice", toCategory: "roti" }]), initialTrip: "2026-09-21" });
    expect(screen.queryByRole("button", { name: /Swap items/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /Edit meal/ }).length).toBeGreaterThan(0);
  });
  it("next arrow moves one week forward", () => {
    replace.mockClear();
    multi();
    fireEvent.click(screen.getAllByRole("button", { name: "Next week" })[0]!);
    expect(replace.mock.calls[0]![0]).toContain("week=2026-09-28");
  });
});

describe("action registry", () => {
  it("maps every TripAction to a sheet component", () => {
    expect(Object.keys(ACTION_SHEETS).sort()).toEqual(["address", "move", "pick", "swap"]);
  });
});
