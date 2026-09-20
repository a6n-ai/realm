// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { PlanView } from "../../adapter";
import { PickSheet } from "../pick-sheet";
import { SwapSheet } from "../swap-sheet";

const apply = vi.fn();
const remove = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
  applyMyDeliverySwap: (...a: unknown[]) => apply(...a),
  removeMyDeliverySwap: (...a: unknown[]) => remove(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
beforeEach(() => {
  apply.mockReset().mockResolvedValue({ ok: true });
  remove.mockReset().mockResolvedValue({ ok: true });
  refresh.mockReset();
});
afterEach(cleanup);

const pairs = [{ fromCategory: "rice", toCategory: "roti" }, { fromCategory: "roti", toCategory: "rice" }];
const mon = "2026-09-21", tue = "2026-09-22";
const trip = (o: Partial<Trip> = {}): Trip => ({
  date: mon, deliveryId: "dlv1", units: 2, coversDates: [mon, tue], coversLabel: "Covers Mon + Tue",
  eatingDays: [
    { date: mon, dishSummary: "Paneer, Jeera Rice", swaps: [], locksWith: null },
    { date: tue, dishSummary: "Dal", swaps: ["1 Rice → 4 Roti"], locksWith: mon },
  ],
  status: "upcoming", cutoffAt: Date.now() + 36e5 * 30, mergedInto: null, isMakeup: false, pooled: false, rescheduled: false, ...o,
});
const plan = {
  orderId: "o", today: "2026-09-20", categoryLabels: { rice: "Rice", roti: "Roti" }, categoryPortions: { rice: "8oz", roti: "1 roti" },
  sub: { mealSizeName: "Large" },
  ctx: { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: null, deliveryWeekdays: ["mon"], active: true },
  days: [{
    date: mon, meal: [{ category: "rice", label: "Rice", picks: [], quantity: 2 }],
    eatingDays: [
      { date: mon, appliedSwaps: [], swapPairs: pairs },
      { date: tue, appliedSwaps: [{ publicId: "sw1", fromCategory: "rice", toCategory: "roti", qtyFrom: 1, qtyTo: 4 }], swapPairs: pairs },
    ],
  }],
} as unknown as PlanView;
const swap = (t = trip(), onDone = vi.fn()) => (render(<SwapSheet trip={t} plan={plan} open onDone={onDone} />), onDone);

describe("SwapSheet", () => {
  it("shows a tab per covered eating day and pairs for the selected day", () => {
    swap();
    expect(screen.getByRole("tab", { name: /Mon/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /Tue/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Rice → Roti" })).toBeInTheDocument();
  });
  it("applies a swap for the selected day with forDate, toasts, refreshes and closes", async () => {
    const onDone = swap();
    fireEvent.click(screen.getByRole("tab", { name: /Tue/ }));
    fireEvent.click(screen.getByRole("button", { name: "Rice → Roti" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply swap" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith("dlv1", "rice", "roti", 1, tue));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(refresh).toHaveBeenCalled();
  });
  it("stepper is clamped to what the meal has", () => {
    swap();
    fireEvent.click(screen.getByRole("button", { name: "Rice → Roti" }));
    const inc = screen.getByRole("button", { name: /Increase/ });
    fireEvent.click(inc);
    fireEvent.click(inc);
    expect(inc).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Apply swap" }));
    return waitFor(() => expect(apply).toHaveBeenCalledWith("dlv1", "rice", "roti", 2, mon));
  });
  it("lists applied swaps of the selected day only and removes with forDate", async () => {
    const onDone = swap();
    expect(screen.queryByText(/1 Rice → 4 Roti/)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Tue/ }));
    fireEvent.click(screen.getByRole("button", { name: /Remove swap 1 Rice → 4 Roti/ }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("dlv1", "sw1", tue));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
  it("keeps the sheet open and shows the server error", async () => {
    apply.mockResolvedValue({ error: "At most 1 Curry per tiffin" });
    const onDone = swap();
    fireEvent.click(screen.getByRole("button", { name: "Rice → Roti" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply swap" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("At most 1 Curry per tiffin");
    expect(onDone).not.toHaveBeenCalled();
  });
  it("Apply is disabled until a pair is chosen", () => {
    swap();
    fireEvent.click(screen.getByRole("button", { name: "Apply swap" }));
    expect(apply).not.toHaveBeenCalled();
  });
  it("locked trip shows the reason and cannot apply", () => {
    swap(trip({ status: "delivered" }));
    expect(screen.getByText(/Changes closed/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rice → Roti" })).toBeNull();
  });
  it("cutoff passed while status still upcoming is locked", () => {
    swap(trip({ cutoffAt: Date.now() - 1000 }));
    expect(screen.getByText(/Changes closed/)).toBeInTheDocument();
  });
});

describe("PickSheet", () => {
  it("summarises each eating day and links to the menu for the trip date", () => {
    render(<PickSheet trip={trip()} plan={plan} open onDone={vi.fn()} />);
    expect(screen.getByText("Paneer, Jeera Rice")).toBeInTheDocument();
    expect(screen.getByText("Dal")).toBeInTheDocument();
    expect(screen.getByText(/Locks with/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Choose meals/ })).toHaveAttribute("href", `/me/meals?date=${mon}`);
  });
  it("shows default note when a day has no dishes, and reason when locked", () => {
    render(<PickSheet trip={trip({ status: "delivered", eatingDays: [{ date: mon, dishSummary: null, swaps: [], locksWith: null }] })} plan={plan} open onDone={vi.fn()} />);
    expect(screen.getByText(/Changes closed/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Choose meals/ })).toBeNull();
  });
});
