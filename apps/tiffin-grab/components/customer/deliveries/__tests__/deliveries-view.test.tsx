// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import { ACTION_SHEETS } from "../actions/registry";
import { DeliveriesView } from "../deliveries-view";
import type { PlanView } from "../adapter";

vi.mock("@/app/(customer)/me/deliveries/pick-grid", () => ({ loadPickGrid: () => new Promise(() => {}) }));
vi.mock("@/app/(customer)/me/meals/actions", () => ({ pickMyDish: vi.fn(), applyMyDishToWeek: vi.fn() }));
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
  render(<DeliveriesView plan={p} subs={[p.sub]} windows={{}} trips={t} now={NOW} monthKey="2026-09" initialTrip={sel} />);

describe("DeliveriesView", () => {
  it("shows plan summary with tiffin counts, hold days and status pills", () => {
    view();
    const line = screen.getByText(/16 of 20 tiffins left/).closest("p")!;
    expect(line).toHaveTextContent("Large");
    expect(line).toHaveTextContent("2 hold days");
    expect(line).toHaveTextContent("renews in 11 days");
  });
  it("selected trip detail lists eating-day dishes", () => {
    view();
    expect(screen.getByText("Paneer, Jeera Rice")).toBeInTheDocument();
  });
  it("inline actions are in the card for an upcoming trip, opens the pick sheet in one click", () => {
    view();
    fireEvent.click(screen.getAllByRole("button", { name: /Pick meals/ })[0]!);
    expect(screen.getByRole("dialog", { name: "Pick meals" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
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
    expect(screen.getAllByText("Bhindi Masala ×2").length).toBe(2);
    err.mockRestore();
  });
  it("a merged source day has no row and folds into its target's covers line", () => {
    const t = [
      trip({ date: "2026-09-23", status: "combined-into", mergedInto: "2026-09-24", eatingDays: [] }),
      trip({ date: "2026-09-24", units: 2, coversLabel: "Covers Wed + Thu", coversDates: ["2026-09-23", "2026-09-24"] }),
    ];
    view("2026-09-23", t);
    expect(screen.queryByText("Nothing arrives")).toBeNull();
    expect(screen.getAllByTestId("trip-row")).toHaveLength(2);
    expect(screen.getAllByRole("heading", { name: "Thu, Sep 24" }).length).toBe(1);
  });
  it("earlier trips are hidden until asked for", () => {
    view("2026-09-23", [trip({ date: "2026-09-19", status: "delivered", eatingDays: [] }), ...trips]);
    expect(screen.queryByRole("button", { name: /Sat, Sep 19/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show earlier" }));
    expect(screen.getAllByRole("button", { name: /Sat, Sep 19/ }).length).toBe(1);
  });
  it("plan switcher tells same-sized plans apart by their dates and links each one", () => {
    const later = { ...plan.sub, publicId: "ord_later" };
    const last = { ...plan.sub, publicId: "ord_last" };
    render(
      <DeliveriesView
        plan={plan}
        subs={[later, plan.sub, last]}
        windows={{
          [plan.sub.publicId]: { first: "2026-09-18", last: "2026-09-25", next: "2026-09-22" },
          ord_later: { first: "2026-09-28", last: "2026-10-21", next: "2026-09-28" },
          ord_last: { first: "2026-10-26", last: "2026-11-18", next: "2026-10-26" },
        }}
        trips={trips}
        now={NOW}
        monthKey="2026-09"
        initialTrip="2026-09-23"
      />,
    );
    const nav = screen.getByRole("navigation", { name: "Your plans" });
    const links = within(nav).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringContaining("Running · to Sep 25"),
      expect.stringContaining("Starts Sep 28"),
      expect.stringContaining("Starts Oct 26"),
    ]);
    expect(links[1]!.getAttribute("href")).toContain("sub=ord_later");
    expect(links[0]).toHaveAttribute("aria-current", "true");
  });
  it("?action opens its sheet on load", () => {
    render(<DeliveriesView plan={plan} subs={[plan.sub]} windows={{}} trips={trips} now={NOW} monthKey="2026-09" initialTrip="2026-09-23" initialAction="hold" />);
    expect(screen.getByRole("dialog", { name: /^Hold / })).toBeInTheDocument();
  });
  it("empty month shows a plain message", () => {
    view(null, []);
    expect(screen.getByText(/No deliveries in September/)).toBeInTheDocument();
  });
  it("soft month change reselects a trip in the new month (does not fake empty)", () => {
    const { rerender } = view("2026-09-23");
    expect(screen.queryByText(/No deliveries in September/)).toBeNull();
    const october = [
      trip({
        date: "2026-10-01",
        coversDates: ["2026-10-01"],
        eatingDays: [{ date: "2026-10-01", dishSummary: "Dal, Rice", swaps: [], locksWith: null }],
      }),
      trip({ date: "2026-10-07", coversDates: ["2026-10-07"], eatingDays: [] }),
    ];
    rerender(
      <DeliveriesView
        plan={plan}
        subs={[plan.sub]}
        windows={{}}
        trips={october}
        now={NOW}
        monthKey="2026-10"
        initialTrip="2026-10-01"
      />,
    );
    expect(screen.queryByText(/No deliveries in October/)).toBeNull();
    expect(screen.getAllByRole("heading", { name: /Thu, Oct 1|Wed, Oct 7/ }).length).toBeGreaterThan(0);
  });
});

describe("action registry", () => {
  it("maps every TripAction to a sheet component", () => {
    expect(Object.keys(ACTION_SHEETS).sort()).toEqual(["hold", "makeup", "move", "pick", "pool", "resume", "swap", "vacation"]);
  });
});
