// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { PlanView } from "../adapter";
import { MoveSheet } from "../actions/move-sheet";

const a = vi.hoisted(() => ({ move: vi.fn() }));
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({ rescheduleMyDelivery: a.move }));

const NOW = Date.parse("2026-09-21T12:00:00Z");
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  Object.values(a).forEach((f) => f.mockReset());
});
afterEach(cleanup);

const trip = (o: Partial<Trip> = {}): Trip => ({ orderId: "o",
  date: "2026-09-23", deliveryId: "d1", units: 2, coversDates: ["2026-09-22", "2026-09-23"], coversLabel: "Covers Tue + Wed", eatingDays: [],
  status: "upcoming", cutoffAt: Date.parse("2026-09-23T18:00:00Z"), mergedInto: null, isMakeup: false, rescheduled: false, ...o,
});
const plan = {
  orderId: "o", today: "2026-09-21",
  days: [{ date: "2026-09-25", status: "scheduled", units: 2, covers: ["2026-09-24", "2026-09-25"] }],
  ctx: { cutoffHour: 18, timezone: "UTC", lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"], active: true },
} as unknown as PlanView;

const mount = (C: typeof MoveSheet, t: Trip, onDone = vi.fn()) => (render(<C trip={t} plan={plan} open onDone={onDone} />), onDone);

describe("MoveSheet", () => {
  it("needs a day first", () => {
    mount(MoveSheet, trip());
    expect(screen.getByText("Pick a day. Greyed days aren't available.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move" }));
    expect(a.move).not.toHaveBeenCalled();
  });
  it("shows the month on top and marks delivery days with a truck", () => {
    mount(MoveSheet, trip());
    expect(screen.getByText(/^Sep \d+ – (Sep|Oct|Nov) \d+( · This week)?$/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Saturday, September 26(?!.*delivery)/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    expect(screen.getByRole("button", { name: /Monday, September 28, .*delivery day/ })).toBeInTheDocument();
  });
  it("every eating day can be picked; a non-delivery day previews which delivery carries it", () => {
    mount(MoveSheet, trip());
    fireEvent.click(screen.getAllByRole("button", { name: "Next week" })[0]!);
    const tue = screen.getByRole("button", { name: /Tuesday, September 29/ });
    expect(tue).not.toHaveAttribute("aria-disabled");
    expect(tue.getAttribute("aria-label")).not.toContain("delivery day");
    fireEvent.click(tue);
    expect(screen.getByText("Arrives Mon, Sep 28")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Monday, September 28, .*delivery day/ })).not.toHaveAttribute("aria-disabled");
  });
  it("free day: preview then move", async () => {
    a.move.mockResolvedValue({ ok: true, message: "moved" });
    const onDone = mount(MoveSheet, trip({ units: 2, coversDates: ["2026-09-23"], coversLabel: null }));
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    fireEvent.click(screen.getByRole("button", { name: /Monday, September 28/ }));
    expect(screen.getByText("Arrives Mon, Sep 28")).toBeInTheDocument();
    expect(screen.getByText("2 tiffins that day")).toBeInTheDocument();
    expect(screen.getByText("Can't move again")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move to Mon, Sep 28" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Moved Wed, Sep 23 to Mon, Sep 28."));
    expect(a.move).toHaveBeenCalledWith("d1", "2026-09-28", "2026-09-23");
  });
  it("multi-day bundle splits only the chosen day's tiffin", async () => {
    a.move.mockResolvedValue({ ok: true, message: "moved" });
    const onDone = mount(MoveSheet, trip());
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    fireEvent.click(screen.getByRole("button", { name: /Monday, September 28/ }));
    expect(screen.getByText("1 tiffin that day")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move to Mon, Sep 28" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Moved Wed, Sep 23 to Mon, Sep 28."));
    expect(a.move).toHaveBeenCalledWith("d1", "2026-09-28", "2026-09-23");
  });
  it("occupied day: merge preview with covered days", async () => {
    a.move.mockResolvedValue({ ok: true, message: "merged" });
    const onDone = mount(MoveSheet, trip({ units: 1, coversDates: ["2026-09-23"], coversLabel: null }));
    fireEvent.click(screen.getByRole("button", { name: /Friday, September 25/ }));
    expect(screen.getByText("3 tiffins that day")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move to Fri, Sep 25" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Moved Wed, Sep 23 to Fri, Sep 25."));
  });
  it("a delivery that would exceed 3 tiffins is not offered", () => {
    const fullPlan = {
      ...plan,
      days: [{ date: "2026-09-25", status: "scheduled", units: 3, covers: ["2026-09-23", "2026-09-24", "2026-09-25"] }],
    } as unknown as PlanView;
    render(<MoveSheet trip={trip()} plan={fullPlan} open onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: /Friday, September 25/ })).toHaveAttribute("aria-disabled", "true");
  });
  it("opens on today's week even when the trip being moved is in a later week", () => {
    mount(MoveSheet, trip({ date: "2026-10-05", coversDates: ["2026-10-05"], cutoffAt: Date.parse("2026-10-05T18:00:00Z") }));
    expect(within(screen.getByTestId("week-timeline")).getByText(/^Sep 21 – Sep 27/)).toBeInTheDocument();
  });
  it("a not-yet-started plan opens on its own start week, not today's", () => {
    const futurePlan = { ...plan, ctx: { ...plan.ctx, startDate: "2026-10-05" } } as unknown as PlanView;
    render(<MoveSheet trip={trip({ date: "2026-10-05", coversDates: ["2026-10-05"], cutoffAt: Date.parse("2026-10-05T18:00:00Z") })} plan={futurePlan} open onDone={vi.fn()} />);
    expect(within(screen.getByTestId("week-timeline")).getByText(/^Oct 5 – Oct 11/)).toBeInTheDocument();
  });
  it("closed day is disabled with its reason on tap", () => {
    mount(MoveSheet, trip());
    fireEvent.click(screen.getByRole("button", { name: /Monday, September 21/ }));
    expect(screen.getByText(/already closed for changes/)).toBeInTheDocument();
  });
  it("server error stays inline", async () => {
    a.move.mockResolvedValue({ error: "That day isn't on your plan" });
    const onDone = mount(MoveSheet, trip());
    fireEvent.click(screen.getByRole("button", { name: "Next week" }));
    fireEvent.click(screen.getByRole("button", { name: /Monday, September 28/ }));
    fireEvent.click(screen.getByRole("button", { name: "Move to Mon, Sep 28" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That day isn't on your plan");
    expect(onDone).not.toHaveBeenCalled();
  });
  it("unavailable trip shows the plain-words reason", () => {
    mount(MoveSheet, trip({ status: "rescheduled", rescheduled: true }));
    expect(screen.getAllByText("Already moved.").length).toBeGreaterThan(0);
  });
});
