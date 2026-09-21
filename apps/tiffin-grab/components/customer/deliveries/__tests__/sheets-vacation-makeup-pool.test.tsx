// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { PlanView } from "../adapter";
import { MakeupSheet } from "../actions/makeup-sheet";
import { PoolSheet } from "../actions/pool-sheet";
import { VacationSheet } from "../actions/vacation-sheet";

const m = vi.hoisted(() => ({ pause: vi.fn(), resume: vi.fn(), schedule: vi.fn(), refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
  pauseMySubscription: m.pause,
  resumeMySubscription: m.resume,
  scheduleMyPooledTiffin: m.schedule,
}));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const trip = { date: "2026-09-23", status: "upcoming" } as Trip;
const mk = (o: { pooled?: number; onVacation?: boolean; limits?: object; usage?: object; persons?: number } = {}) =>
  ({
    orderId: "o",
    today: "2026-09-21",
    sub: { publicId: "o", status: o.onVacation ? "paused" : "active" },
    counts: { pooled: o.pooled ?? 0, persons: o.persons ?? 1, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"] },
    ctx: { cutoffHour: 18, timezone: "UTC", pooled: o.pooled ?? 0, active: true, onVacation: !!o.onVacation },
    pause: { limits: { maxPauses: null, maxPauseDaysTotal: null, maxPauseStretchDays: null, ...o.limits }, usage: { count: 0, daysUsed: 0, ...o.usage } },
  }) as unknown as PlanView;
const cell = (label: RegExp) => screen.getByRole("button", { name: label });

describe("VacationSheet", () => {
  it("mounts, no start selected: CTA blocked with a reason, nothing sent", () => {
    render(<VacationSheet trip={trip} plan={mk()} open onDone={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Pause deliveries" }));
    expect(screen.getAllByText("Choose a start date.")[0]).toBeInTheDocument();
    expect(m.pause).not.toHaveBeenCalled();
  });

  it("start may be today (inclusive) and end is optional: open-ended pause", async () => {
    m.pause.mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<VacationSheet trip={trip} plan={mk()} open onDone={onDone} />);
    fireEvent.click(cell(/Monday, September 21/));
    expect(screen.getByText(/stay paused until you resume/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause deliveries" }));
    await waitFor(() => expect(m.pause).toHaveBeenCalledWith("o", { from: "2026-09-21", until: "2026-09-21", indefinite: true }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Vacation set."));
  });

  it("mounts without any trip", () => {
    render(<VacationSheet plan={mk()} open onDone={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Pause deliveries" })).toBeInTheDocument();
  });

  it("with an end date shows the confirmation summary and sends the range", async () => {
    m.pause.mockResolvedValue({ ok: true });
    render(<VacationSheet trip={trip} plan={mk()} open onDone={vi.fn()} />);
    fireEvent.click(cell(/Monday, September 28/));
    fireEvent.click(screen.getByRole("switch", { name: /end date/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /Friday, October 2\b/ })[1]!);
    expect(screen.getByText(/Trips from Mon, Sep 28 to Fri, Oct 2 are paused/)).toBeInTheDocument();
    expect(screen.getByText(/appends undelivered days after your last day/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Pause deliveries" }));
    await waitFor(() => expect(m.pause).toHaveBeenCalledWith("o", { from: "2026-09-28", until: "2026-10-02" }));
  });

  it("plans with a stretch limit lock the end date on and cap it", () => {
    render(<VacationSheet trip={trip} plan={mk({ limits: { maxPauseStretchDays: 7 } })} open onDone={vi.fn()} />);
    expect(screen.getByText(/This plan needs an end date \(max 7 days\)/)).toBeInTheDocument();
    fireEvent.click(cell(/Monday, September 28/));
    expect(cell(/Tuesday, October 6.*unavailable/)).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pause deliveries" }));
    expect(screen.getAllByText("Choose an end date.")[0]).toBeInTheDocument();
    expect(m.pause).not.toHaveBeenCalled();
  });

  it("shows limits and usage", () => {
    render(<VacationSheet trip={trip} plan={mk({ limits: { maxPauses: 3, maxPauseDaysTotal: 20 }, usage: { count: 1, daysUsed: 5 } })} open onDone={vi.fn()} />);
    expect(screen.getByText(/2 vacations left/)).toBeInTheDocument();
    expect(screen.getByText(/5 of 20 vacation days used/)).toBeInTheDocument();
  });

  it("blocks with a plain reason when no vacations are left", () => {
    render(<VacationSheet trip={trip} plan={mk({ limits: { maxPauses: 1 }, usage: { count: 1 } })} open onDone={vi.fn()} />);
    fireEvent.click(cell(/Monday, September 21/));
    fireEvent.click(screen.getByRole("button", { name: "Pause deliveries" }));
    expect(screen.getAllByText("You've used all your vacation stretches").length).toBeGreaterThan(0);
    expect(m.pause).not.toHaveBeenCalled();
  });

  it("keeps the sheet open with the server error and re-enables the CTA", async () => {
    m.pause.mockResolvedValue({ error: "That range is too long (max 7 days)" });
    const onDone = vi.fn();
    render(<VacationSheet trip={trip} plan={mk()} open onDone={onDone} />);
    fireEvent.click(cell(/Monday, September 21/));
    fireEvent.click(screen.getByRole("button", { name: "Pause deliveries" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That range is too long (max 7 days)");
    expect(screen.getByRole("button", { name: "Pause deliveries" })).not.toHaveAttribute("aria-busy");
    expect(onDone).not.toHaveBeenCalled();
  });

  it("on vacation the same sheet becomes Resume deliveries with confirmation", async () => {
    m.resume.mockResolvedValue({ ok: true });
    render(<VacationSheet trip={trip} plan={mk({ onVacation: true })} open onDone={vi.fn()} />);
    expect(screen.getByRole("dialog", { name: "Resume deliveries" })).toBeInTheDocument();
    expect(screen.getByText(/Paused trips return to your schedule/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Resume deliveries" }));
    await waitFor(() => expect(m.resume).toHaveBeenCalledWith("o"));
    expect(m.pause).not.toHaveBeenCalled();
  });
});

describe("MakeupSheet", () => {
  it("offers only plan weekdays strictly after the last delivery, with units per date", () => {
    render(<MakeupSheet trip={trip} plan={mk({ pooled: 3, persons: 2 })} open onDone={vi.fn()} />);
    expect(screen.getByText(/Pick a day after Fri, Oct 2 \(Mon, Wed, Fri\)/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Monday, October 5/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Saturday, October 3/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Friday, October 2\b/ })).toBeNull();
    fireEvent.click(cell(/Monday, October 5/));
    expect(screen.getByText(/carrying 2 tiffins/)).toBeInTheDocument();
  });

  it("units are capped by what is left in the pool", () => {
    render(<MakeupSheet trip={trip} plan={mk({ pooled: 1, persons: 2 })} open onDone={vi.fn()} />);
    fireEvent.click(cell(/Monday, October 5/));
    expect(screen.getByText(/carrying 1 tiffin\b/)).toBeInTheDocument();
  });

  it("CTA needs a day, then schedules and calls onDone", async () => {
    m.schedule.mockResolvedValue({ ok: true });
    const onDone = vi.fn();
    render(<MakeupSheet trip={trip} plan={mk({ pooled: 2 })} open onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Schedule make-up" }));
    expect(screen.getAllByText("Choose a day to continue.")[0]).toBeInTheDocument();
    expect(m.schedule).not.toHaveBeenCalled();
    fireEvent.click(cell(/Wednesday, October 7/));
    fireEvent.click(screen.getByRole("button", { name: "Schedule make-up" }));
    await waitFor(() => expect(m.schedule).toHaveBeenCalledWith("o", "2026-10-07"));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Make-up scheduled for Wed, Oct 7."));
  });

  it("shows the server error inline", async () => {
    m.schedule.mockResolvedValue({ error: "Date must be after your last delivery" });
    render(<MakeupSheet trip={trip} plan={mk({ pooled: 2 })} open onDone={vi.fn()} />);
    fireEvent.click(cell(/Wednesday, October 7/));
    fireEvent.click(screen.getByRole("button", { name: "Schedule make-up" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Date must be after your last delivery");
  });

  it("empty pool: nothing to schedule", () => {
    render(<MakeupSheet trip={trip} plan={mk({ pooled: 0 })} open onDone={vi.fn()} />);
    expect(screen.getAllByText(/No tiffins waiting/)[0]).toBeInTheDocument();
    expect(screen.queryByRole("group")).toBeNull();
  });
});

describe("PoolSheet", () => {
  it("explains the pool with the tiffin count and opens make-up", () => {
    render(<PoolSheet trip={{ ...trip, status: "hold", pooled: true }} plan={mk({ pooled: 3 })} open onDone={vi.fn()} />);
    expect(screen.getByText(/3 tiffins are waiting/)).toBeInTheDocument();
    expect(screen.getByText(/You keep every tiffin you paid for/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Schedule a make-up" }));
    expect(screen.getByRole("dialog", { name: "Schedule a make-up" })).toBeInTheDocument();
    expect(screen.getByText(/Pick a day after/)).toBeInTheDocument();
  });

  it("singular and empty pool", () => {
    const { rerender } = render(<PoolSheet trip={trip} plan={mk({ pooled: 1 })} open onDone={vi.fn()} />);
    expect(screen.getByText(/1 tiffin is waiting/)).toBeInTheDocument();
    rerender(<PoolSheet trip={trip} plan={mk({ pooled: 0 })} open onDone={vi.fn()} />);
    expect(screen.getAllByText(/Nothing is waiting/)[0]).toBeInTheDocument();
  });
});
