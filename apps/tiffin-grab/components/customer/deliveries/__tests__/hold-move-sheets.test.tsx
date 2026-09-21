// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { PlanView } from "../adapter";
import { HoldSheet } from "../actions/hold-sheet";
import { MoveSheet } from "../actions/move-sheet";

const a = vi.hoisted(() => ({ skip: vi.fn(), unskip: vi.fn(), move: vi.fn() }));
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({ skipMyDelivery: a.skip, unskipMyDelivery: a.unskip, rescheduleMyDelivery: a.move }));

const NOW = Date.parse("2026-09-21T12:00:00Z");
beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
  Object.values(a).forEach((f) => f.mockReset());
});
afterEach(cleanup);

const trip = (o: Partial<Trip> = {}): Trip => ({ orderId: "o",
  date: "2026-09-23", deliveryId: "d1", units: 2, coversDates: ["2026-09-22", "2026-09-23"], coversLabel: "Covers Tue + Wed", eatingDays: [],
  status: "upcoming", cutoffAt: Date.parse("2026-09-23T18:00:00Z"), mergedInto: null, isMakeup: false, pooled: false, rescheduled: false, ...o,
});
const plan = {
  orderId: "o", today: "2026-09-21",
  days: [{ date: "2026-09-25", status: "scheduled", units: 2, covers: ["2026-09-24", "2026-09-25"] }],
  counts: { holdDays: 1 },
  ctx: { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: "2026-10-02", deliveryWeekdays: ["mon", "wed", "fri"], active: true },
} as unknown as PlanView;

const mount = (C: typeof HoldSheet, t: Trip, onDone = vi.fn()) => (render(<C trip={t} plan={plan} open onDone={onDone} />), onDone);

describe("HoldSheet", () => {
  it("states consequence, holds, toasts the missed days, then calls onDone", async () => {
    a.skip.mockResolvedValue({ ok: true });
    const onDone = mount(HoldSheet, trip());
    expect(screen.getByRole("dialog", { name: "Hold Wed, Sep 23" })).toBeInTheDocument();
    expect(screen.getByText(/2 tiffins won't be delivered/)).toBeInTheDocument();
    expect(screen.getByText(/Free until Wed 6:00 pm/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hold this trip" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.stringMatching(/Held Wed, Sep 23.*Tue and Wed tiffins go to your pool/)));
    expect(a.skip).toHaveBeenCalledWith("d1");
  });
  it("shows the server error and keeps the sheet open", async () => {
    a.skip.mockResolvedValue({ error: "Cutoff passed" });
    const onDone = mount(HoldSheet, trip());
    fireEvent.click(screen.getByRole("button", { name: "Hold this trip" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Cutoff passed");
    expect(onDone).not.toHaveBeenCalled();
  });
  it("held trip branches to Resume", async () => {
    a.unskip.mockResolvedValue({ ok: true });
    const onDone = mount(HoldSheet, trip({ status: "hold" }));
    expect(screen.getByRole("dialog", { name: "Resume Wed, Sep 23" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Resume trip" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.stringMatching(/Resumed Wed, Sep 23/)));
    expect(a.unskip).toHaveBeenCalledWith("d1");
  });
  it("pooled hold cannot resume: reason shown, action not called", () => {
    mount(HoldSheet, trip({ status: "hold", pooled: true }));
    expect(screen.getAllByText("This hold is in your pool. Schedule it on a day instead.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Resume trip" }));
    expect(a.unskip).not.toHaveBeenCalled();
  });
});

describe("MoveSheet", () => {
  it("needs a day first", () => {
    mount(MoveSheet, trip());
    expect(screen.getAllByText("Choose a day to continue.").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Move trip" }));
    expect(a.move).not.toHaveBeenCalled();
  });
  it("shows the month on top and marks delivery days with a truck", () => {
    mount(MoveSheet, trip());
    expect(screen.getByText(/^September/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Monday, September 28, delivery day/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Saturday, September 26(?!, delivery)/ })).toBeInTheDocument();
  });
  it("free day: preview then move", async () => {
    a.move.mockResolvedValue({ ok: true, message: "moved" });
    const onDone = mount(MoveSheet, trip());
    fireEvent.click(screen.getByRole("button", { name: /Monday, September 28/ }));
    expect(screen.getByText(/Your 2 tiffins will arrive on Mon, Sep 28/)).toBeInTheDocument();
    expect(screen.getByText(/can't be put back on hold/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move to Mon, Sep 28" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith("Moved Wed, Sep 23 to Mon, Sep 28."));
    expect(a.move).toHaveBeenCalledWith("d1", "2026-09-28");
  });
  it("occupied day: merge preview with covered days", async () => {
    a.move.mockResolvedValue({ ok: true, message: "merged" });
    const onDone = mount(MoveSheet, trip());
    fireEvent.click(screen.getByRole("button", { name: /Friday, September 25/ }));
    expect(screen.getByText(/already has a delivery. Both trips combine into one: 4 tiffins on Fri, Sep 25. Covers Tue \+ Wed \+ Thu \+ Fri/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Move to Fri, Sep 25" }));
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(expect.stringMatching(/combined with that trip/)));
  });
  it("closed day is disabled with its reason on tap", () => {
    mount(MoveSheet, trip());
    fireEvent.click(screen.getByRole("button", { name: /Monday, September 21/ }));
    expect(screen.getByText(/already closed for changes/)).toBeInTheDocument();
  });
  it("server error stays inline", async () => {
    a.move.mockResolvedValue({ error: "That day isn't on your plan" });
    const onDone = mount(MoveSheet, trip());
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
