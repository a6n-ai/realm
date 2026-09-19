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
});
