// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { SwapOption } from "@/lib/menu/meal-validation";
import type { PlanView } from "../../adapter";
import { SwapSheet } from "../swap-sheet";

const apply = vi.fn();
const remove = vi.fn();
const loadOptions = vi.fn();
const refresh = vi.fn();
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
  applyMyDeliverySwap: (...a: unknown[]) => apply(...a),
  removeMyDeliverySwap: (...a: unknown[]) => remove(...a),
  loadMySwapOptions: (...a: unknown[]) => loadOptions(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

const option = (over: Partial<SwapOption> & Pick<SwapOption, "fromCategory" | "toCategory" | "validBundles">): SwapOption => ({
  available: true,
  reason: null,
  minFromPicks: over.validBundles[0]?.fromPicks ?? null,
  maxFromPicks: over.validBundles[over.validBundles.length - 1]?.fromPicks ?? null,
  bundleIncrement: over.validBundles.length > 1
    ? (over.validBundles[1]!.fromPicks - over.validBundles[0]!.fromPicks)
    : (over.validBundles[0]?.fromPicks ?? null),
  giveNatural: over.validBundles[0]?.giveNatural ?? null,
  getNatural: over.validBundles[0]?.getNatural ?? null,
  ...over,
});

const riceToRoti2 = option({
  fromCategory: "rice",
  toCategory: "roti",
  validBundles: [{ fromPicks: 2, toPicks: 8, giveNatural: "2 rice", getNatural: "8 rotis" }],
  giveNatural: "2 rice",
  getNatural: "8 rotis",
  minFromPicks: 2,
  maxFromPicks: 2,
  bundleIncrement: 2,
});

const rotiToRice = option({
  fromCategory: "roti",
  toCategory: "rice",
  validBundles: [
    { fromPicks: 4, toPicks: 1, giveNatural: "4 rotis", getNatural: "1 rice" },
    { fromPicks: 8, toPicks: 2, giveNatural: "8 rotis", getNatural: "2 rice" },
  ],
  giveNatural: "4 rotis",
  getNatural: "1 rice",
  minFromPicks: 4,
  maxFromPicks: 8,
  bundleIncrement: 4,
});

const sabjiToDaal = option({
  fromCategory: "sabji",
  toCategory: "daal",
  validBundles: [{ fromPicks: 1, toPicks: 1, giveNatural: "12 oz", getNatural: "12 oz" }],
  giveNatural: "12 oz",
  getNatural: "12 oz",
});

beforeEach(() => {
  apply.mockReset().mockResolvedValue({ ok: true });
  remove.mockReset().mockResolvedValue({ ok: true });
  loadOptions.mockReset().mockResolvedValue({ ok: true, options: [riceToRoti2, rotiToRice] });
  refresh.mockReset();
  onChanged.mockReset();
});
afterEach(cleanup);

const pairs = [{ fromCategory: "rice", toCategory: "roti" }, { fromCategory: "roti", toCategory: "rice" }];
const mon = "2026-09-21", tue = "2026-09-22";
const trip = (o: Partial<Trip> = {}): Trip => ({
  orderId: "o",
  date: mon, deliveryId: "dlv1", units: 2, coversDates: [mon, tue], coversLabel: "Covers Mon + Tue",
  eatingDays: [
    { date: mon, dishSummary: "Paneer, Jeera Rice", swaps: [], locksWith: null },
    { date: tue, dishSummary: "Dal", swaps: ["1 Rice → 4 Roti"], locksWith: mon },
  ],
  status: "upcoming", cutoffAt: Date.now() + 36e5 * 30, mergedInto: null, isMakeup: false, pooled: false, rescheduled: false, ...o,
});
const plan = {
  orderId: "o", today: "2026-09-20",
  categoryLabels: { rice: "Rice", roti: "Roti", sabji: "Sabji", daal: "Daal" },
  categoryPortions: { rice: "8oz", roti: "4 rotis", sabji: "12 oz", daal: "12 oz" },
  sub: { mealSizeName: "Large" },
  ctx: { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: null, deliveryWeekdays: ["mon"], active: true },
  days: [{
    date: mon,
    meal: [
      { category: "sabji", label: "Sabji", quantity: 2, selectable: true, picks: [
        { dishPublicId: "d1", dishId: 1n, name: "Aloo Gobi", isDefaulted: false },
        { dishPublicId: "d2", dishId: 2n, name: "Bhindi", isDefaulted: false },
      ] },
      { category: "daal", label: "Daal", quantity: 1, selectable: true, picks: [
        { dishPublicId: "d3", dishId: 3n, name: "Dal Tadka", isDefaulted: false },
      ] },
      { category: "roti", label: "Roti", quantity: 2, selectable: false, picks: [
        { dishPublicId: "d4", dishId: 4n, name: "Roti", isDefaulted: true },
      ] },
    ],
    eatingDays: [
      { date: mon, appliedSwaps: [], swapPairs: pairs },
      { date: tue, appliedSwaps: [{ publicId: "sw1", fromCategory: "rice", toCategory: "roti", qtyFrom: 2, qtyTo: 8 }], swapPairs: pairs },
    ],
  }],
  swapCategories: {
    rice: { key: "rice", pickTu: 1, unitType: "count", unitLabel: "rice", unitSize: 1, maxPicksPerTiffin: null },
    roti: { key: "roti", pickTu: 0.25, unitType: "count", unitLabel: "roti", unitSize: 4, maxPicksPerTiffin: null },
  },
} as unknown as PlanView;
const onChanged = vi.fn();
const swap = (t = trip(), onDone = vi.fn(), p = plan) => (render(<SwapSheet trip={t} plan={p} open onDone={onDone} onChanged={onChanged} />), onDone);

async function waitForOptions() {
  await waitFor(() => expect(loadOptions).toHaveBeenCalled());
  await waitFor(() => expect(screen.queryByLabelText("Finding available swaps")).not.toBeInTheDocument());
}

describe("SwapSheet — backend-driven options", () => {
  it("loads options from listValidSwapOptions (via loadMySwapOptions) for the selected day", async () => {
    swap();
    await waitFor(() => expect(loadOptions).toHaveBeenCalledWith("dlv1", mon));
    expect(await screen.findByRole("button", { name: "Rice → Roti" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Roti → Rice" })).toBeInTheDocument();
  });

  it("shows a tab per covered eating day and reloads options when the day changes", async () => {
    swap();
    await waitForOptions();
    expect(screen.getByRole("tab", { name: /Mon/ })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: /Tue/ }));
    await waitFor(() => expect(loadOptions).toHaveBeenCalledWith("dlv1", tue));
  });

  it("Test 1 — Rice → Roti never offers 1 rice when only 2→8 is valid", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [riceToRoti2] });
    swap();
    fireEvent.click(await screen.findByRole("button", { name: "Rice → Roti" }));
    expect(screen.getByText("2 rice → 8 rotis")).toBeInTheDocument();
    expect(screen.getByText(/Give up/).textContent).toMatch(/2 rice/);
    expect(screen.getByText(/Give up/).textContent).toMatch(/8 rotis/);
    expect(screen.queryByText(/1 rice/i)).toBeNull();
    // Single valid bundle → no stepper (nothing to increment into).
    expect(screen.queryByRole("button", { name: /Increase rice/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Apply swap" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith("dlv1", "rice", "roti", 2, mon));
  });

  it("Test 2 — only backend-returned options appear (configured reverse not invented)", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [rotiToRice] });
    swap();
    expect(await screen.findByRole("button", { name: "Roti → Rice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rice → Roti" })).toBeNull();
  });

  it("Test 3 — natural quantities, never TU", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [rotiToRice] });
    swap();
    fireEvent.click(await screen.findByRole("button", { name: "Roti → Rice" }));
    expect(screen.getByText("4 rotis → 1 rice")).toBeInTheDocument();
    expect(screen.queryByText(/\bTU\b/)).toBeNull();
  });

  it("Test 4 — multiple valid bundles: stepper only lands on backend states", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [rotiToRice] });
    swap();
    fireEvent.click(await screen.findByRole("button", { name: "Roti → Rice" }));
    expect(screen.getByText(/Give up/).textContent).toMatch(/4 rotis/);
    const inc = screen.getByRole("button", { name: /Increase roti/ });
    fireEvent.click(inc);
    expect(screen.getByText(/Give up/).textContent).toMatch(/8 rotis/);
    expect(screen.getByText(/Give up/).textContent).toMatch(/2 rice/);
    expect(inc).toHaveAttribute("aria-disabled", "true");
    fireEvent.click(screen.getByRole("button", { name: "Apply swap" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith("dlv1", "roti", "rice", 8, mon));
  });

  it("Test 5/6 — Max TU / max picks: unavailable options are not actionable (backend filtered)", async () => {
    // Backend hideUnavailable already dropped the over-cap pair; UI must not invent it.
    loadOptions.mockResolvedValue({ ok: true, options: [sabjiToDaal] });
    swap();
    expect(await screen.findByRole("button", { name: "Sabji → Daal" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Roti → Rice" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rice → Roti" })).toBeNull();
  });

  it("Test 7 — directionality: Roti→Rice alone does not imply Rice→Roti", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [rotiToRice] });
    swap();
    await waitForOptions();
    expect(screen.getByRole("button", { name: "Roti → Rice" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rice → Roti" })).toBeNull();
  });

  it("Test 8 — successful apply calls apply action, refreshes options, keeps sheet via onChanged", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [riceToRoti2] });
    const onDone = swap();
    fireEvent.click(await screen.findByRole("button", { name: "Rice → Roti" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply swap" }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith("dlv1", "rice", "roti", 2, mon));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("Swap applied to Mon, Sep 21."));
    expect(onDone).not.toHaveBeenCalled();
    await waitFor(() => expect(loadOptions.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("Test 9 — backend rejection shows error, does not toast success, reloads options", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [riceToRoti2] });
    apply.mockResolvedValue({ error: "This swap requires an even portion exchange." });
    const onDone = swap();
    fireEvent.click(await screen.findByRole("button", { name: "Rice → Roti" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply swap" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/even portion exchange/);
    expect(onDone).not.toHaveBeenCalled();
    expect(onChanged).not.toHaveBeenCalled();
    await waitFor(() => expect(loadOptions.mock.calls.length).toBeGreaterThanOrEqual(2));
  });

  it("Test 10 — Meal Rule rejection surfaces backend message", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [sabjiToDaal] });
    apply.mockResolvedValue({ error: "At most 1 Sabji per tiffin on this plan" });
    swap();
    fireEvent.click(await screen.findByRole("button", { name: "Sabji → Daal" }));
    fireEvent.click(screen.getByRole("button", { name: "Apply swap" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/At most 1 Sabji/);
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("Test 11 — empty state when no valid swaps (no Apply footer)", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [] });
    swap();
    expect(await screen.findByText("No swaps are available for this meal.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Apply swap" })).toBeNull();
  });

  it("Test 12 — double submit blocked while applying", async () => {
    let resolveApply!: (v: { ok: true }) => void;
    apply.mockReturnValue(new Promise((r) => { resolveApply = r; }));
    loadOptions.mockResolvedValue({ ok: true, options: [riceToRoti2] });
    swap();
    fireEvent.click(await screen.findByRole("button", { name: "Rice → Roti" }));
    const btn = screen.getByRole("button", { name: "Apply swap" });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(apply).toHaveBeenCalledTimes(1);
    resolveApply({ ok: true });
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it("shows Your meal summary from delivery meal data", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [] });
    swap();
    const meal = await screen.findByRole("region", { name: "Your meal" }).catch(() =>
      screen.getByLabelText("Your meal"),
    );
    expect(within(meal).getByText("Aloo Gobi")).toBeInTheDocument();
    expect(within(meal).getByText("Bhindi")).toBeInTheDocument();
    expect(within(meal).getByText("Dal Tadka")).toBeInTheDocument();
  });

  it("lists applied swaps of the selected day and removes with forDate", async () => {
    swap();
    await waitForOptions();
    fireEvent.click(screen.getByRole("tab", { name: /Tue/ }));
    await waitFor(() => expect(loadOptions).toHaveBeenCalledWith("dlv1", tue));
    fireEvent.click(await screen.findByRole("button", { name: /Remove swap/ }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("dlv1", "sw1", tue));
    await waitFor(() => expect(onChanged).toHaveBeenCalledWith("Swap removed from Tue, Sep 22."));
  });

  it("load error is retryable", async () => {
    loadOptions.mockResolvedValueOnce({ error: "Delivery is locked" });
    swap();
    expect(await screen.findByRole("alert")).toHaveTextContent(/Delivery is locked/);
    loadOptions.mockResolvedValue({ ok: true, options: [riceToRoti2] });
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByRole("button", { name: "Rice → Roti" })).toBeInTheDocument();
  });

  it("locked trip shows the reason and does not load options", async () => {
    swap(trip({ status: "delivered" }));
    expect(screen.getByText(/Changes closed/)).toBeInTheDocument();
    expect(loadOptions).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Rice → Roti" })).toBeNull();
  });

  it("cutoff passed while status still upcoming is locked", () => {
    swap(trip({ cutoffAt: Date.now() - 1000 }));
    expect(screen.getByText(/Changes closed/)).toBeInTheDocument();
  });

  it("Apply is disabled until a pair is chosen", async () => {
    loadOptions.mockResolvedValue({ ok: true, options: [riceToRoti2] });
    swap();
    await waitForOptions();
    fireEvent.click(screen.getByRole("button", { name: "Apply swap" }));
    expect(apply).not.toHaveBeenCalled();
  });
});
