// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { AddonsPanel } from "../addons-panel";
import { initialSelections, offeredAddons, pickedAddons, type WizardSelections } from "../selections";

afterEach(cleanup);

const sabzi = { key: "extra-sabzi", name: "Extra Sabzi", category: "sabzi", tuAmount: 1, pricePerTiffin: 3.5, maxQty: 2, portion: "8oz" };
const roti = { key: "extra-roti", name: "Extra Roti", category: "roti", tuAmount: 0.5, pricePerTiffin: 1, maxQty: 4, portion: "2 roti" };
const sel = (o: Partial<WizardSelections> = {}): WizardSelections => ({ ...initialSelections, mealSizeId: "msz_1", ...o });

describe("AddonsPanel", () => {
  it("names each add-on with its portion and price per tiffin", () => {
    render(<AddonsPanel addons={[sabzi, roti]} selections={sel()} set={vi.fn()} />);
    expect(screen.getByText("Extra Roti").textContent).toBe("Extra Roti · 2 roti");
    expect(screen.getByText("+$1.00 per tiffin")).toBeTruthy();
  });

  it("adds one, then shows a stepper for a picked add-on", () => {
    const set = vi.fn();
    const { rerender } = render(<AddonsPanel addons={[sabzi]} selections={sel()} set={set} />);
    fireEvent.click(screen.getByRole("button", { name: "Add Extra Sabzi" }));
    expect(set).toHaveBeenCalledWith({ addonSelections: [{ key: "extra-sabzi", qty: 1 }] });
    rerender(<AddonsPanel addons={[sabzi]} selections={sel({ addonSelections: [{ key: "extra-sabzi", qty: 1 }] })} set={set} />);
    expect(screen.queryByRole("button", { name: "Add Extra Sabzi" })).toBeNull();
  });
});

describe("offeredAddons / pickedAddons", () => {
  const catalog = {
    mealSizes: [
      { publicId: "msz_1", name: "Thali", trial: false, items: [{ category: "sabzi" }, { category: "roti" }] },
      { publicId: "msz_trial", name: "Trial", trial: true, items: [{ category: "sabzi" }] },
    ],
    addonsByCategory: { sabzi: [sabzi], roti: [roti] },
  } as unknown as ClientCatalogSnapshot;

  it("offers the picked meal's add-ons, none for a trial", () => {
    expect(offeredAddons(catalog, sel()).map((a) => a.key)).toEqual(["extra-sabzi", "extra-roti"]);
    expect(offeredAddons(catalog, sel({ mealSizeId: "msz_trial" }))).toEqual([]);
  });

  it("names picked add-ons and drops ones the meal doesn't offer", () => {
    const s = sel({ addonSelections: [{ key: "extra-roti", qty: 2 }, { key: "gone", qty: 1 }] });
    expect(pickedAddons(catalog, s)).toEqual([{ name: "Extra Roti", qty: 2 }]);
  });
});
