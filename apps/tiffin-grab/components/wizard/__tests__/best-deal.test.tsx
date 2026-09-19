// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { BestDeal } from "../best-deal";
import { initialSelections } from "../selections";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";

afterEach(cleanup);

const catalog = {
  plans: [],
  mealSizes: [{ publicId: "msz_1", key: "k", name: "K", planKey: "veg", tier: "budget", components: [], items: [], basePrice: 10, discountType: "none", discountValue: 0, trial: false }],
  frequencies: [
    { publicId: "frq_5", key: "5_day", name: "5", daysPerWeek: 5, weekdays: ["mon", "tue", "wed", "thu", "fri"] },
    { publicId: "frq_3", key: "3_day", name: "3", daysPerWeek: 3, weekdays: ["mon", "wed", "fri"] },
  ],
  durations: [{ publicId: "dur_1", weeks: 1 }, { publicId: "dur_8", weeks: 8 }],
  zones: [],
  tiers: [{ minQty: 1, maxQty: 11, upliftPct: 20 }, { minQty: 12, maxQty: 19, upliftPct: 10 }, { minQty: 20, maxQty: null, upliftPct: 0 }],
  discounts: [{ key: "dl", name: "dl", kind: "delivery", targetPublicId: "frq_3", percent: 10, minWeeks: null }],
  maxDiscountPct: 25,
} as unknown as ClientCatalogSnapshot;

const sel = (over = {}) => ({ ...initialSelections, mealSizeId: "msz_1", frequencyKey: "5_day", eatingDays: ["mon", "wed", "fri"] as never, durationWeeks: 1, mealSlots: ["lunch"], ...over });

describe("BestDeal", () => {
  it("schedule step: recommends only a delivery type", () => {
    const set = vi.fn();
    render(<BestDeal vary="frequency" catalog={catalog} selections={sel({ durationWeeks: 8 })} set={set} />);
    expect(screen.getByText(/3-day delivery/)).toBeTruthy();
    expect(screen.getByText("Tip for your delivery")).toBeTruthy();
    expect(screen.getByText(/save 10% on every tiffin/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(set).toHaveBeenCalledWith({ frequencyKey: "3_day" });
  });

  it("applying a delivery tip keeps the customer's tiffins, even when eating days are still the frequency default", () => {
    const set = vi.fn();
    const monToFri = ["mon", "tue", "wed", "thu", "fri"] as never;
    render(<BestDeal vary="frequency" catalog={catalog} selections={sel({ eatingDays: monToFri })} set={set} />);
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(set).toHaveBeenCalledTimes(1);
    expect(set.mock.calls[0][0]).toEqual({ frequencyKey: "3_day" });
  });

  it("duration step: recommends only weeks", () => {
    const set = vi.fn();
    render(<BestDeal vary="duration" catalog={catalog} selections={sel({ frequencyKey: "3_day" })} set={set} />);
    expect(screen.getByText(/8 weeks/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(set).toHaveBeenCalledWith({ durationWeeks: 8 });
  });

  it("is hidden without a meal size", () => {
    render(<BestDeal vary="duration" catalog={catalog} selections={sel({ mealSizeId: "" })} set={vi.fn()} />);
    expect(screen.queryByText(/Tip for your/)).toBeNull();
  });

  it("is dismissible", async () => {
    render(<BestDeal vary="duration" catalog={catalog} selections={sel()} set={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss best deal" }));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Use this" })).toBeNull());
  });

  it("frequency: green applied state with Undo restoring frequency and eating days", () => {
    const set = vi.fn();
    const { rerender } = render(<BestDeal vary="frequency" catalog={catalog} selections={sel({ durationWeeks: 8 })} set={set} />);
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    expect(set).toHaveBeenLastCalledWith({ frequencyKey: "3_day" });
    rerender(<BestDeal vary="frequency" catalog={catalog} selections={sel({ durationWeeks: 8, frequencyKey: "3_day" })} set={set} />);
    return waitFor(() => {
      expect(screen.queryByRole("button", { name: "Use this" })).toBeNull();
      expect(screen.getByText("Applied")).toBeTruthy();
      expect(screen.getByText(/You're getting 3-day delivery — saving 10% on every tiffin/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Undo" }));
      expect(set).toHaveBeenLastCalledWith({ frequencyKey: "5_day" });
    });
  });

  it("applied state is derived from selections, so Undo works after a fresh mount (falls back to least-discounted)", () => {
    const set = vi.fn();
    render(<BestDeal vary="duration" catalog={catalog} selections={sel({ frequencyKey: "3_day", durationWeeks: 8 })} set={set} />);
    expect(screen.getByText("Applied")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(set).toHaveBeenCalledWith({ durationWeeks: 1 });
  });

  it("dismissing hides the green card too", async () => {
    render(<BestDeal vary="duration" catalog={catalog} selections={sel({ frequencyKey: "3_day", durationWeeks: 8 })} set={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Dismiss best deal" }));
    await waitFor(() => expect(screen.queryByText("Applied")).toBeNull());
  });

  it("no card when no option differs in price", () => {
    const flat = { ...catalog, discounts: [], tiers: [{ minQty: 1, maxQty: null, upliftPct: 0 }] } as unknown as ClientCatalogSnapshot;
    render(<BestDeal vary="frequency" catalog={flat} selections={sel()} set={vi.fn()} />);
    expect(screen.queryByRole("region")).toBeNull();
  });

  describe("bundle", () => {
    const disc = (pct: number, over = {}) => ({ ...catalog, mealSizes: [{ ...catalog.mealSizes[0], planKey: "veg", discountType: "percent", discountValue: pct }, { ...catalog.mealSizes[0], publicId: "msz_2", name: "Two", planKey: "veg" }], ...over }) as unknown as ClientCatalogSnapshot;
    it("recommends the discounted meal, then goes green with Undo clearing the selection", () => {
      const set = vi.fn();
      const c = disc(10);
      const { rerender } = render(<BestDeal vary="bundle" catalog={c} selections={sel({ planKey: "veg", mealSizeId: "msz_2" })} set={set} />);
      expect(screen.getByText("Deal on now")).toBeTruthy();
      expect(screen.getByText(/Select K: 10% off right now/)).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Use this" }));
      expect(set).toHaveBeenLastCalledWith({ mealSizeId: "msz_1" });
      rerender(<BestDeal vary="bundle" catalog={c} selections={sel({ planKey: "veg", mealSizeId: "msz_1" })} set={set} />);
      return waitFor(() => {
        expect(screen.getByText("Applied")).toBeTruthy();
        fireEvent.click(screen.getByRole("button", { name: "Undo" }));
        expect(set).toHaveBeenLastCalledWith({ mealSizeId: "msz_2" });
      });
    });
    it("shows nothing when no meal size is discounted", () => {
      render(<BestDeal vary="bundle" catalog={disc(0, { mealSizes: [{ ...catalog.mealSizes[0], planKey: "veg" }] })} selections={sel({ planKey: "veg" })} set={vi.fn()} />);
      expect(screen.queryByText("Deal on now")).toBeNull();
    });
  });
});
