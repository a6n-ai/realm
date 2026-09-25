// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Trip } from "@/lib/deliveries-view";
import type { GridCell } from "@/lib/menu/meals-grid";
import type { PlanView } from "../../adapter";
import { PickSheet } from "../pick-sheet";

const load = vi.fn();
const pick = vi.fn();
const savePicks = vi.fn();
const applyWeek = vi.fn();
const loadSwaps = vi.fn();
const applySwap = vi.fn();
const removeSwap = vi.fn();

vi.mock("@/app/(customer)/me/deliveries/pick-grid", () => ({ loadPickGrid: (...a: unknown[]) => load(...a) }));
vi.mock("@/app/(customer)/me/meals/actions", () => ({
  pickMyDish: (...a: unknown[]) => pick(...a),
  saveMyMealSelections: (...a: unknown[]) => savePicks(...a),
  applyMyDishToWeek: (...a: unknown[]) => applyWeek(...a),
}));
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
  loadMySwapOptions: (...a: unknown[]) => loadSwaps(...a),
  applyMyDeliverySwap: (...a: unknown[]) => applySwap(...a),
  removeMyDeliverySwap: (...a: unknown[]) => removeSwap(...a),
}));

const mon = "2026-09-21",
  tue = "2026-09-22";
const dishes = [
  { id: "d1", name: "Paneer", image: null },
  { id: "d2", name: "Dal", image: null },
];
const cell = (o: Partial<GridCell>): GridCell => ({
  day: "mon",
  dateIso: mon,
  slot: "curry",
  personIndex: 1,
  pickIndex: 1,
  selectable: true,
  quantity: 1,
  selectedDishId: "d1",
  isDefaulted: true,
  dishes,
  locked: false,
  lockNote: null,
  ...o,
});
const grid = (
  cells: GridCell[],
  persons = 1,
  extras: {
    categories?: { key: string; label: string; selectable: boolean; sortOrder: number }[];
    portionsBySlot?: Record<string, (string | null)[]>;
    portionsByDate?: Record<string, Record<string, (string | null)[]>>;
  } = {},
) => ({
  ok: true,
  grid: {
    cells,
    persons,
    categories: extras.categories ?? [{ key: "curry", label: "Curry", selectable: true, sortOrder: 1 }],
    portionsBySlot: extras.portionsBySlot ?? { curry: ["8oz"] },
    portionsByDate: extras.portionsByDate ?? {},
    weekByDate: { [mon]: "wk1", [tue]: "wk1" },
  },
});
const trip = (o: Partial<Trip> = {}): Trip => ({
  orderId: "o",
  date: mon,
  deliveryId: "dlv1",
  units: 2,
  coversDates: [mon, tue],
  coversLabel: "Covers Mon + Tue",
  eatingDays: [],
  status: "upcoming",
  cutoffAt: Date.now() + 36e5 * 30,
  mergedInto: null,
  isMakeup: false,
  pooled: false,
  rescheduled: false,
  ...o,
});
const plan = {
  orderId: "o1",
  ctx: { cutoffHour: 18, timezone: "UTC", pooled: 0, lastDeliveryDate: null, deliveryWeekdays: ["mon"], active: true },
  categoryLabels: { curry: "Curry", daal: "Daal" },
  swapCategories: {},
  days: [],
} as unknown as PlanView;

const show = (t = trip()) => {
  const onDone = vi.fn();
  render(<PickSheet trip={t} plan={plan} open onDone={onDone} />);
  return onDone;
};

beforeEach(() => {
  load.mockReset();
  pick.mockReset().mockResolvedValue({ ok: true });
  savePicks.mockReset().mockResolvedValue({ ok: true, saved: 1 });
  applyWeek.mockReset().mockResolvedValue({ applied: 3, skipped: [] });
  loadSwaps.mockReset().mockResolvedValue({ options: [] });
  applySwap.mockReset().mockResolvedValue({ ok: true });
  removeSwap.mockReset().mockResolvedValue({ ok: true });
});
afterEach(cleanup);

describe("PickSheet", () => {
  it("shows radio groups per composition row with portion labels", async () => {
    load.mockResolvedValue(
      grid([cell({ pickIndex: 1 }), cell({ pickIndex: 2 })], 1, {
        categories: [{ key: "curry", label: "Curry", selectable: true, sortOrder: 1 }],
        portionsBySlot: { curry: ["12oz", "8oz"] },
      }),
    );
    show(trip({ coversDates: [mon] }));
    expect(await screen.findByRole("radiogroup", { name: "Curry · 12oz" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Curry · 8oz" })).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit meal" })).toBeInTheDocument();
  });

  it("asks for the grid of every covered eating day", async () => {
    load.mockResolvedValue(grid([cell({}), cell({ dateIso: tue, day: "tue", lockNote: "Locks with Monday's delivery" })]));
    show();
    expect(await screen.findByRole("radiogroup", { name: "Curry · 8oz" })).toBeInTheDocument();
    expect(load).toHaveBeenCalledWith("o1", [mon, tue]);
  });

  it("has day tabs for a multi-day trip and shows the carried lock note", async () => {
    load.mockResolvedValue(grid([cell({}), cell({ dateIso: tue, day: "tue", lockNote: "Locks with Monday's delivery" })]));
    show();
    fireEvent.click(await screen.findByRole("tab", { name: /Tue/ }));
    expect(screen.getByText("Locks with Monday's delivery")).toBeInTheDocument();
  });

  it("opens on the eating day the customer selected", async () => {
    load.mockResolvedValue(grid([cell({}), cell({ dateIso: tue, day: "tue", lockNote: "Locks with Monday's delivery" })]));
    render(<PickSheet trip={trip()} plan={plan} day={tue} open onDone={vi.fn()} />);
    expect(await screen.findByText("Locks with Monday's delivery")).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /Tue/ })).toHaveAttribute("aria-selected", "true");
  });

  it("single-day trip has no day tabs", async () => {
    load.mockResolvedValue(grid([cell({})]));
    show(trip({ coversDates: [mon] }));
    await screen.findByRole("radiogroup", { name: "Curry · 8oz" });
    expect(screen.queryByRole("tab", { name: /Mon/ })).toBeNull();
  });

  it("picks per person with the chosen person index on Done", async () => {
    load.mockResolvedValue(grid([cell({}), cell({ personIndex: 2, selectedDishId: "d1" })], 2));
    show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("tab", { name: "Person 2" }));
    fireEvent.click(screen.getByRole("radio", { name: /^Dal$/ }));
    expect(savePicks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() =>
      expect(savePicks).toHaveBeenCalledWith({
        orderId: "o1",
        picks: [
          expect.objectContaining({
            menuWeekId: "wk1",
            personIndex: 2,
            slot: "curry",
            dishId: "d2",
            dayOfWeek: "mon",
          }),
        ],
      }),
    );
  });

  it("never renders Apply dishes to the whole week button in the sheet", async () => {
    load.mockResolvedValue(grid([cell({})]));
    show(trip({ coversDates: [mon] }));
    await screen.findByRole("radio", { name: /^Dal$/ });
    expect(screen.queryByRole("button", { name: /Apply dishes to the whole week/i })).toBeNull();
  });

  it("embeds valid swap destinations as radios on the leading row", async () => {
    loadSwaps.mockResolvedValue({
      options: [
        {
          fromCategory: "curry",
          toCategory: "daal",
          available: true,
          reason: null,
          validBundles: [{ fromPicks: 1, toPicks: 1, giveNatural: "8oz", getNatural: "8oz" }],
          minFromPicks: 1,
          maxFromPicks: 1,
          bundleIncrement: 1,
          giveNatural: "8oz",
          getNatural: "8oz",
        },
      ],
    });
    load.mockResolvedValue(grid([cell({})]));
    show(trip({ coversDates: [mon] }));
    const swapRadio = await screen.findByRole("radio", { name: /Daal · 8oz/ });
    expect(swapRadio).toHaveTextContent("Choose this instead");
    fireEvent.click(swapRadio);
    await screen.findByText(/Swapped to Daal/);
    expect(applySwap).not.toHaveBeenCalled();
  });

  it("persists a queued swap only when Done is pressed", async () => {
    loadSwaps.mockResolvedValue({
      options: [
        {
          fromCategory: "curry",
          toCategory: "daal",
          available: true,
          reason: null,
          validBundles: [{ fromPicks: 1, toPicks: 1, giveNatural: "8oz", getNatural: "8oz" }],
          minFromPicks: 1,
          maxFromPicks: 1,
          bundleIncrement: 1,
          giveNatural: "8oz",
          getNatural: "8oz",
        },
      ],
    });
    load.mockResolvedValue(grid([cell({})]));
    const onDone = show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("radio", { name: /Daal · 8oz/ }));
    await screen.findByText(/Swapped to Daal/);
    expect(applySwap).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(applySwap).toHaveBeenCalledWith("dlv1", "curry", "daal", 1, mon));
    expect(onDone).toHaveBeenCalledWith("Meals saved");
  });

  it("discards a queued swap when the sheet closes without Done", async () => {
    loadSwaps.mockResolvedValue({
      options: [
        {
          fromCategory: "curry",
          toCategory: "daal",
          available: true,
          reason: null,
          validBundles: [{ fromPicks: 1, toPicks: 1, giveNatural: "8oz", getNatural: "8oz" }],
          minFromPicks: 1,
          maxFromPicks: 1,
          bundleIncrement: 1,
          giveNatural: "8oz",
          getNatural: "8oz",
        },
      ],
    });
    load.mockResolvedValue(grid([cell({})]));
    const onDone = show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("radio", { name: /Daal · 8oz/ }));
    await screen.findByText(/Swapped to Daal/);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(applySwap).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith();
  });

  it("shows Included for fixed categories with no admin outgoing swaps", async () => {
    load.mockResolvedValue(
      grid(
        [
          cell({
            slot: "rice",
            selectable: false,
            dishes: [{ id: "r1", name: "Jeera Rice", image: null }],
            selectedDishId: "r1",
          }),
        ],
        1,
        {
          categories: [{ key: "rice", label: "Rice", selectable: false, sortOrder: 2 }],
          portionsBySlot: { rice: ["1 unit"] },
        },
      ),
    );
    show(trip({ coversDates: [mon] }));
    const riceSection = await screen.findByLabelText("Rice");
    expect(within(riceSection).getByText("Included")).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup", { name: /Rice/ })).toBeNull();
  });

  it("shows radios on fixed categories when admin swap pairs start from that category", async () => {
    loadSwaps.mockResolvedValue({
      options: [
        {
          fromCategory: "rice",
          toCategory: "roti",
          available: true,
          reason: null,
          validBundles: [{ fromPicks: 1, toPicks: 1, giveNatural: "1 unit", getNatural: "2 roti" }],
          minFromPicks: 1,
          maxFromPicks: 1,
          bundleIncrement: 1,
          giveNatural: "1 unit",
          getNatural: "2 roti",
        },
      ],
    });
    load.mockResolvedValue(
      grid(
        [
          cell({
            slot: "rice",
            selectable: false,
            dishes: [{ id: "r1", name: "Jeera Rice", image: null }],
            selectedDishId: "r1",
          }),
        ],
        1,
        {
          categories: [{ key: "rice", label: "Rice", selectable: false, sortOrder: 2 }],
          portionsBySlot: { rice: ["1 unit"] },
        },
      ),
    );
    const ricePlan = {
      ...plan,
      categoryLabels: { rice: "Rice", roti: "Roti" },
    } as unknown as PlanView;
    render(<PickSheet trip={trip({ coversDates: [mon] })} plan={ricePlan} open onDone={vi.fn()} />);
    expect(await screen.findByRole("radiogroup", { name: "Rice · 1 unit" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Jeera Rice$/ })).toBeInTheDocument();
    const swapRadio = screen.getByRole("radio", { name: /Roti · 2 roti/ });
    expect(swapRadio).toHaveTextContent("Choose this instead");
    expect(screen.queryByText("Included")).toBeNull();
    expect(screen.queryByRole("button", { name: "Apply dishes to the whole week" })).toBeNull();
    fireEvent.click(swapRadio);
    await screen.findByText(/Swapped to Roti/);
    expect(applySwap).not.toHaveBeenCalled();
  });

  it("locked day disables radios", async () => {
    load.mockResolvedValue(grid([cell({ locked: true })]));
    show(trip({ coversDates: [mon] }));
    expect(await screen.findByRole("radio", { name: /^Dal$/ })).toBeDisabled();
    expect(screen.getByText(/Locked/)).toBeInTheDocument();
  });

  it("shows the server error when a pick is rejected on Done (Meal Rules / validation)", async () => {
    savePicks.mockResolvedValue({ error: "You can select only 1 sabzi exclusive to this plan in this meal." });
    load.mockResolvedValue(grid([cell({})]));
    show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("radio", { name: /^Dal$/ }));
    expect(savePicks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(await screen.findByText(/only 1 sabzi exclusive/i)).toBeInTheDocument();
  });

  it("shows Your meal summary from current selections", async () => {
    load.mockResolvedValue(
      grid([cell({ selectedDishId: "d1", isDefaulted: false })], 1, { portionsBySlot: { curry: ["8oz"] } }),
    );
    show(trip({ coversDates: [mon] }));
    expect(await screen.findByRole("heading", { name: "Your meal" })).toBeInTheDocument();
    expect(screen.getByText("Paneer · 8oz")).toBeInTheDocument();
  });

  it("Done closes with a toast only after a change", async () => {
    load.mockResolvedValue(grid([cell({})]));
    const onDone = show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("radio", { name: /^Dal$/ }));
    expect(savePicks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    await waitFor(() => expect(savePicks).toHaveBeenCalled());
    expect(onDone).toHaveBeenCalledWith("Meals saved");
  });

  it("closed trip shows the reason", async () => {
    load.mockResolvedValue(grid([cell({})]));
    show(trip({ cutoffAt: Date.now() - 1000 }));
    expect(screen.getByText(/Changes closed/)).toBeInTheDocument();
    expect(await screen.findByRole("radio", { name: /^Dal$/ })).toBeDisabled();
  });

  it("renders 6 roti default portion in slot label and Your meal summary for a 6-roti plan", async () => {
    load.mockResolvedValue(
      grid(
        [
          cell({
            slot: "roti",
            selectable: false,
            quantity: 6,
            dishes: [{ id: "rt1", name: "Roti (Veg)", image: null }],
            selectedDishId: "rt1",
          }),
        ],
        1,
        {
          categories: [{ key: "roti", label: "Roti", selectable: false, sortOrder: 1 }],
          portionsBySlot: { roti: ["6 roti"] },
        },
      ),
    );
    loadSwaps.mockResolvedValue({
      options: [
        {
          fromCategory: "roti",
          toCategory: "rice",
          available: true,
          reason: null,
          validBundles: [{ fromPicks: 4, toPicks: 1, giveNatural: "4 roti", getNatural: "1 unit" }],
          fromPicks: 4,
          toPicks: 1,
          maxFromPicks: 4,
          bundleIncrement: 4,
          giveNatural: "4 roti",
          getNatural: "1 unit",
        },
      ],
    });
    const rotiPlan = {
      ...plan,
      categoryLabels: { roti: "Roti", rice: "Rice" },
    } as unknown as PlanView;
    render(<PickSheet trip={trip({ coversDates: [mon] })} plan={rotiPlan} open onDone={vi.fn()} />);

    // Slot heading displays 6 roti
    expect(await screen.findByRole("radiogroup", { name: "Roti · 6 roti" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /^Roti \(Veg\)$/ })).toBeInTheDocument();

    // Swap option available
    expect(screen.getByRole("radio", { name: /Rice · 1 unit · uses 4 items/ })).toBeInTheDocument();

    // Your meal summary displays 6 roti
    expect(screen.getByRole("heading", { name: "Your meal" })).toBeInTheDocument();
    expect(screen.getByText("Roti (Veg) · 6 roti")).toBeInTheDocument();
  });

  it("sanitizes Minified React error #441 if thrown when saving picks on Done", async () => {
    load.mockResolvedValue(
      grid([cell({ day: "mon", dateIso: mon, slot: "curry", dishes, selectedDishId: "d1" })]),
    );
    savePicks.mockResolvedValueOnce({
      error: "Minified React error #441; visit https://reactjs.org/docs/error-decoder.html?invariant=441",
    });

    render(<PickSheet trip={trip({ coversDates: [mon] })} plan={plan} open onDone={vi.fn()} />);

    const dalRadio = await screen.findByRole("radio", { name: /^Dal$/ });
    fireEvent.click(dalRadio);
    expect(savePicks).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      // Must NOT render Minified React error #441
      expect(screen.queryByText(/Minified React error/)).not.toBeInTheDocument();
      expect(screen.queryByText(/invariant=441/)).not.toBeInTheDocument();
      expect(screen.getByText("Couldn't save that pick. Try again.")).toBeInTheDocument();
    });
  });

  it("does not save picks and discards draft choices when closed via close button", async () => {
    load.mockResolvedValue(grid([cell({})]));
    const onDone = show(trip({ coversDates: [mon] }));
    const dalRadio = await screen.findByRole("radio", { name: /^Dal$/ });
    fireEvent.click(dalRadio);
    expect(dalRadio).toBeChecked();
    expect(savePicks).not.toHaveBeenCalled();

    const closeBtn = screen.getByRole("button", { name: "Close" });
    fireEvent.click(closeBtn);

    expect(savePicks).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith();
  });

  it("sanitizes Minified React error #441 if thrown when saving a swap on Done", async () => {
    load.mockResolvedValue(
      grid([cell({ day: "mon", dateIso: mon, slot: "curry", dishes, selectedDishId: "d1" })]),
    );
    loadSwaps.mockResolvedValue({
      options: [
        {
          fromCategory: "curry",
          toCategory: "daal",
          available: true,
          reason: null,
          validBundles: [{ fromPicks: 1, toPicks: 1, giveNatural: "8oz", getNatural: "8oz" }],
          fromPicks: 1,
          toPicks: 1,
          maxFromPicks: 1,
          bundleIncrement: 1,
          giveNatural: "8oz",
          getNatural: "8oz",
        },
      ],
    });
    applySwap.mockResolvedValueOnce({
      error: "Minified React error #441; visit https://reactjs.org/docs/error-decoder.html?invariant=441",
    });

    show(trip({ coversDates: [mon] }));

    const swapRadio = await screen.findByRole("radio", { name: /Daal · 8oz/ });
    fireEvent.click(swapRadio);
    await screen.findByText(/Swapped to Daal/);
    fireEvent.click(screen.getByRole("button", { name: "Done" }));

    await waitFor(() => {
      expect(screen.queryByText(/Minified React error/)).not.toBeInTheDocument();
      expect(screen.getByText("Couldn't save that pick. Try again.")).toBeInTheDocument();
    });
  });
});

