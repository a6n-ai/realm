// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { GridCell } from "@/lib/menu/meals-grid";
import type { PlanView } from "../../adapter";
import { PickSheet } from "../pick-sheet";

const load = vi.fn();
const pick = vi.fn();
const applyWeek = vi.fn();
vi.mock("@/app/(customer)/me/deliveries/pick-grid", () => ({ loadPickGrid: (...a: unknown[]) => load(...a) }));
vi.mock("@/app/(customer)/me/meals/actions", () => ({
  pickMyDish: (...a: unknown[]) => pick(...a),
  applyMyDishToWeek: (...a: unknown[]) => applyWeek(...a),
}));

const mon = "2026-09-21", tue = "2026-09-22";
const dishes = [{ id: "d1", name: "Paneer", image: null }, { id: "d2", name: "Dal", image: null }];
const cell = (o: Partial<GridCell>): GridCell => ({
  day: "mon", dateIso: mon, slot: "curry", personIndex: 1, pickIndex: 1, selectable: true, quantity: 1,
  selectedDishId: "d1", isDefaulted: true, dishes, locked: false, lockNote: null, ...o,
});
const grid = (cells: GridCell[], persons = 1) => ({
  ok: true, grid: { cells, persons, categories: [{ key: "curry", label: "Curry", selectable: true, sortOrder: 1 }], weekByDate: { [mon]: "wk1", [tue]: "wk1" } },
});
const trip = (o: Partial<Trip> = {}): Trip => ({ orderId: "o",
  date: mon, deliveryId: "dlv1", units: 2, coversDates: [mon, tue], coversLabel: "Covers Mon + Tue",
  eatingDays: [], status: "upcoming", cutoffAt: Date.now() + 36e5 * 30, mergedInto: null, isMakeup: false, pooled: false, rescheduled: false, ...o,
});
const plan = { orderId: "o1", ctx: { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: null, deliveryWeekdays: ["mon"], active: true } } as unknown as PlanView;
const show = (t = trip()) => {
  const onDone = vi.fn();
  render(<PickSheet trip={t} plan={plan} open onDone={onDone} />);
  return onDone;
};

beforeEach(() => {
  load.mockReset();
  pick.mockReset().mockResolvedValue({ ok: true });
  applyWeek.mockReset().mockResolvedValue({ applied: 3, skipped: [] });
});
afterEach(cleanup);

describe("PickSheet", () => {
  it("asks for the grid of every covered eating day and labels an unpicked default", async () => {
    load.mockResolvedValue(grid([cell({}), cell({ dateIso: tue, day: "tue", lockNote: "Locks with Monday's delivery" })]));
    show();
    expect(await screen.findByText("Default pick")).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("o1", [mon, tue]);
  });

  it("has day tabs for a multi-day trip and shows the carried lock note", async () => {
    load.mockResolvedValue(grid([cell({}), cell({ dateIso: tue, day: "tue", lockNote: "Locks with Monday's delivery" })]));
    show();
    fireEvent.click(await screen.findByRole("tab", { name: /Tue/ }));
    expect(screen.getByText("Locks with Monday's delivery")).toBeInTheDocument();
  });

  it("single-day trip has no day tabs", async () => {
    load.mockResolvedValue(grid([cell({})]));
    show(trip({ coversDates: [mon] }));
    await screen.findByText("Paneer");
    expect(screen.queryByRole("tab", { name: /Mon/ })).toBeNull();
  });

  it("picks per person with the chosen person index", async () => {
    load.mockResolvedValue(grid([cell({}), cell({ personIndex: 2, selectedDishId: "d1" })], 2));
    show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("tab", { name: "Person 2" }));
    fireEvent.click(screen.getByRole("button", { name: /Dal/ }));
    await waitFor(() => expect(pick).toHaveBeenCalledWith(expect.objectContaining({ orderId: "o1", menuWeekId: "wk1", personIndex: 2, slot: "curry", dishId: "d2", dayOfWeek: "mon" })));
  });

  it("applies the selected dish to the whole week", async () => {
    load.mockResolvedValue(grid([cell({})]));
    show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("button", { name: "Apply to the whole week" }));
    await waitFor(() => expect(applyWeek).toHaveBeenCalledWith(expect.objectContaining({ menuWeekId: "wk1", slot: "curry", dishId: "d1" })));
    expect(await screen.findByText(/Applied to the rest of the week/)).toBeInTheDocument();
  });

  it("locked day disables tiles and hides apply", async () => {
    load.mockResolvedValue(grid([cell({ locked: true })]));
    show(trip({ coversDates: [mon] }));
    const dal = await screen.findByRole("button", { name: /Dal/ });
    expect(dal).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Apply to the whole week" })).toBeNull();
    expect(screen.getByText(/Locked/)).toBeInTheDocument();
  });

  it("rolls back and shows the server error when a pick is rejected", async () => {
    pick.mockResolvedValue({ error: "Cutoff passed" });
    load.mockResolvedValue(grid([cell({})]));
    show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("button", { name: /Dal/ }));
    expect(await screen.findByText("Cutoff passed")).toBeInTheDocument();
    expect(screen.getByText("Default pick")).toBeInTheDocument();
  });

  it("Done closes with a toast only after a change", async () => {
    load.mockResolvedValue(grid([cell({})]));
    const onDone = show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("button", { name: /Dal/ }));
    await waitFor(() => expect(pick).toHaveBeenCalled());
    await waitFor(() => screen.getByRole("button", { name: "Done" }));
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(onDone).toHaveBeenCalledWith("Meals saved");
  });

  it("closed trip shows the reason", async () => {
    load.mockResolvedValue(grid([cell({})]));
    show(trip({ cutoffAt: Date.now() - 1000 }));
    expect(screen.getByText(/Changes closed/)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Dal/ })).toBeDisabled();
  });
});
