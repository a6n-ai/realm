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
// Swap options are computed in the sheet now (pick-preview); tests set them directly.
const swapOptions = vi.fn((): unknown[] => []);
const applySwap = vi.fn();
const removeSwap = vi.fn();

vi.mock("@/app/(customer)/me/deliveries/pick-grid", () => ({ loadPickGrid: (...a: unknown[]) => load(...a) }));
vi.mock("@/app/(customer)/me/meals/actions", () => ({
  pickMyDish: (...a: unknown[]) => pick(...a),
  saveMyMealSelections: (...a: unknown[]) => savePicks(...a),
}));
vi.mock("@/lib/menu/pick-preview", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/menu/pick-preview")>()),
  previewSwapOptions: () => swapOptions(),
}));
vi.mock("@/app/(customer)/me/deliveries/actions", () => ({
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
    menu: { [mon]: { curry: dishes }, [tue]: { curry: dishes } },
    rules: [],
    mealRules: [],
    preview: { items: [], tu: [], appliedByDate: {}, composition: { baseCounts: {}, mealSizeItems: [], categories: [] }, pairs: [] },
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

/** A swapped row's own dish (not the one already picked elsewhere) — tapping it undoes the swap. */
const ownDishOnSwappedRow = async (name: string) =>
  (await screen.findAllByRole("radio", { name })).find((r) => r.getAttribute("aria-checked") !== "true" && !r.hasAttribute("disabled"))!;

const show = (t = trip()) => {
  const onDone = vi.fn();
  render(<PickSheet trip={t} plan={plan} open onDone={onDone} />);
  return onDone;
};

beforeEach(() => {
  load.mockReset();
  pick.mockReset().mockResolvedValue({ ok: true });
  savePicks.mockReset().mockResolvedValue({ ok: true, saved: 1 });
  swapOptions.mockReset().mockReturnValue([]);
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
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
    swapOptions.mockReturnValue(({ options: [
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
    }).options);
    load.mockResolvedValue(grid([cell({})]));
    show(trip({ coversDates: [mon] }));
    const swapRadio = await screen.findByRole("radio", { name: /^Daal$/ });
    fireEvent.click(swapRadio);
    await screen.findByText(/Swapped to Daal/);
    expect(applySwap).not.toHaveBeenCalled();
  });

  it("persists a queued swap only when Save is pressed", async () => {
    swapOptions.mockReturnValue(({ options: [
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
    }).options);
    load.mockResolvedValue(grid([cell({})]));
    const onDone = show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("radio", { name: /^Daal$/ }));
    await screen.findByText(/Swapped to Daal/);
    expect(applySwap).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(applySwap).toHaveBeenCalledWith("dlv1", "curry", "daal", 1, mon, 0));
    expect(onDone).toHaveBeenCalledWith("Meals saved");
  });

  it("discards a queued swap when the sheet closes without Done", async () => {
    swapOptions.mockReturnValue(({ options: [
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
    }).options);
    load.mockResolvedValue(grid([cell({})]));
    const onDone = show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("radio", { name: /^Daal$/ }));
    await screen.findByText(/Swapped to Daal/);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(applySwap).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledWith();
  });

  it("shows fixed categories as a greyed, already-picked box", async () => {
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
    const fixed = within(riceSection).getByRole("radio", { name: /Jeera Rice/ });
    expect(fixed).toBeDisabled();
    expect(fixed).toHaveAttribute("aria-checked", "true");
  });

  it("shows radios on fixed categories when admin swap pairs start from that category", async () => {
    swapOptions.mockReturnValue(({ options: [
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
    }).options);
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
    expect(screen.getByRole("radio", { name: /^Jeera Rice$/ })).toBeDisabled();
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
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
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

  it("Save closes with a toast after a change", async () => {
    load.mockResolvedValue(grid([cell({})]));
    const onDone = show(trip({ coversDates: [mon] }));
    fireEvent.click(await screen.findByRole("radio", { name: /^Dal$/ }));
    expect(savePicks).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
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
    swapOptions.mockReturnValue(({ options: [
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
    }).options);
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

    fireEvent.click(screen.getByRole("button", { name: "Save" }));

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
    swapOptions.mockReturnValue(({ options: [
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
    }).options);
    applySwap.mockResolvedValueOnce({
      error: "Minified React error #441; visit https://reactjs.org/docs/error-decoder.html?invariant=441",
    });

    show(trip({ coversDates: [mon] }));

    const swapRadio = await screen.findByRole("radio", { name: /^Daal$/ });
    fireEvent.click(swapRadio);
    await screen.findByText(/Swapped to Daal/);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(screen.queryByText(/Minified React error/)).not.toBeInTheDocument();
      expect(screen.getByText("Couldn't save that pick. Try again.")).toBeInTheDocument();
    });
  });

  describe("unsaved swaps", () => {
    const curryToDaal = {
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
    };
    const monSwap = { publicId: "s1", fromCategory: "curry", toCategory: "daal", qtyFrom: 1, qtyTo: 1 };
    const planWithMonSwap = {
      ...plan,
      days: [{ date: mon, eatingDays: [{ date: mon, appliedSwaps: [monSwap] }, { date: tue, appliedSwaps: [] }] }],
    } as unknown as PlanView;

    it("labels the button Done until something changes, then Save, keeping the swapped row in place", async () => {
      swapOptions.mockReturnValue([curryToDaal]);
      load.mockResolvedValue(grid([cell({})]));
      show(trip({ coversDates: [mon] }));
      const swapRadio = await screen.findByRole("radio", { name: /^Daal$/ });
      expect(screen.getByRole("button", { name: "Done" })).toBeInTheDocument();
      fireEvent.click(swapRadio);
      await screen.findByText(/press Save/);
      expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
      const daal = screen.getAllByRole("radio", { name: /^Daal/ });
      expect(daal.some((r) => r.getAttribute("aria-checked") === "true")).toBe(true);
      expect(await ownDishOnSwappedRow("Paneer")).toBeEnabled();
      expect(applySwap).not.toHaveBeenCalled();
    });

    it("keeps a category's own dishes on its rows after every row of it is swapped away", async () => {
      swapOptions.mockReturnValue([curryToDaal]);
      const g = grid([cell({ pickIndex: 1 }), cell({ pickIndex: 2 })], 1, { portionsBySlot: { curry: ["12oz", "8oz"] } });
      load.mockResolvedValue({ ...g, grid: { ...g.grid, menu: { [mon]: { curry: dishes } } } });
      show(trip({ coversDates: [mon] }));
      fireEvent.click((await screen.findAllByRole("radio", { name: /^Daal/ }))[0]!);
      fireEvent.click((await screen.findAllByRole("radio", { name: /^Daal$/ })).find((r) => !r.hasAttribute("disabled") && r.getAttribute("aria-checked") !== "true")!);
      await waitFor(() =>
        expect(screen.getAllByRole("radio", { name: /^Daal/ }).filter((r) => r.getAttribute("aria-checked") === "true")).toHaveLength(2),
      );
      // Both swapped rows still offer the real dishes — never just the category name.
      expect(screen.getAllByRole("radio", { name: "Paneer" })).toHaveLength(2);
      expect(screen.queryByRole("radio", { name: "Curry" })).toBeNull();
    });

    it("an unavailable choice is a plain greyed button; its red ⓘ shows why", async () => {
      swapOptions.mockReturnValue([{ ...curryToDaal, available: false, reason: "Too much Daal today.", validBundles: [] }]);
      load.mockResolvedValue(grid([cell({})]));
      show(trip({ coversDates: [mon] }));
      const daal = await screen.findByRole("radio", { name: /^Daal$/ });
      expect(daal).toBeDisabled();
      expect(screen.queryByText("Daal: Too much Daal today.")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Why Daal is unavailable" }));
      expect(screen.getByText("Daal: Too much Daal today.")).toBeInTheDocument();
    });

    it("folds a swap in locally: no grid reload, and undoing it needs none either", async () => {
      swapOptions.mockReturnValue([curryToDaal]);
      load.mockResolvedValue(grid([cell({})]));
      show(trip({ coversDates: [mon] }));
      fireEvent.click(await screen.findByRole("radio", { name: /^Daal$/ }));
      fireEvent.click(await ownDishOnSwappedRow("Paneer"));
      expect(await screen.findByText(/^Removed/)).toBeInTheDocument();
      expect(load).toHaveBeenCalledTimes(1);
    });

    it("tapping a dish on a swapped row undoes the swap and picks that dish", async () => {
      swapOptions.mockReturnValue([curryToDaal]);
      load.mockResolvedValue(grid([cell({})]));
      const onDone = show(trip({ coversDates: [mon] }));
      fireEvent.click(await screen.findByRole("radio", { name: /^Daal$/ }));
      fireEvent.click(await ownDishOnSwappedRow("Dal"));
      await waitFor(() => expect(screen.getByRole("radio", { name: "Dal" })).toHaveAttribute("aria-checked", "true"));
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(onDone).toHaveBeenCalled());
      expect(applySwap).not.toHaveBeenCalled();
      expect(savePicks).toHaveBeenCalledWith(expect.objectContaining({ picks: [expect.objectContaining({ slot: "curry", dishId: "d2" })] }));
    });

    it("removes a swap with its own eating day even when another day's tab is open at Save", async () => {
      load.mockResolvedValue(grid([cell({}), cell({ dateIso: tue, day: "tue" })]));
      render(<PickSheet trip={trip()} plan={planWithMonSwap} open onDone={vi.fn()} />);
      fireEvent.click(await ownDishOnSwappedRow("Paneer"));
      fireEvent.click(await screen.findByRole("tab", { name: /Tue/ }));
      fireEvent.click(await screen.findByRole("button", { name: "Save" }));
      await waitFor(() => expect(removeSwap).toHaveBeenCalledWith("dlv1", "s1", mon));
    });

    it("retrying Save after a failed apply does not re-send the removal that already succeeded", async () => {
      swapOptions.mockReturnValue([curryToDaal]);
      load.mockResolvedValue(grid([cell({})]));
      applySwap.mockResolvedValueOnce({ error: "Not enough Curry left to give up on this day." });
      render(<PickSheet trip={trip({ coversDates: [mon] })} plan={planWithMonSwap} open onDone={vi.fn()} />);
      fireEvent.click(await ownDishOnSwappedRow("Paneer"));
      fireEvent.click(await screen.findByRole("radio", { name: /^Daal$/ }));
      await screen.findByText(/press Save/);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await screen.findByText(/Not enough Curry/);
      fireEvent.click(screen.getByRole("button", { name: "Save" }));
      await waitFor(() => expect(applySwap).toHaveBeenCalledTimes(2));
      expect(removeSwap).toHaveBeenCalledTimes(1);
    });
  });
});

