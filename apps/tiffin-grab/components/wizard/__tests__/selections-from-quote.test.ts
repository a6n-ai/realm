import { describe, expect, it } from "vitest";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { quoteCodes, quoteQuery, selectionsFromQuote } from "../selections";

const catalog = {
  plans: [{ publicId: "pln_veg", key: "veg", name: "Veg", description: "", planType: "tiffin", offeredSlots: ["lunch"], allowedStartDays: ["mon"] }],
  mealSizes: [
    {
      publicId: "msz_small", key: "small", name: "Small", description: null, planKey: "veg", tier: "basic", components: [], items: [],
      kcalMin: 0, kcalMax: 0, proteinG: null, carbsG: null, fatG: null, basePrice: 9, discountType: "none", discountValue: 0,
      trial: false, custom: false, priceable: true, servesWeekends: false,
    },
  ],
  frequencies: [{ key: "mwf", name: "MWF", weekdays: ["mon", "wed", "fri"] }],
  durations: [{ weeks: 1 }, { weeks: 4 }],
  zones: [],
} as unknown as ClientCatalogSnapshot;

describe("selectionsFromQuote", () => {
  it("carries every quoted pick the catalog still offers", () => {
    const s = selectionsFromQuote(catalog, { plan: "veg", meal: "msz_small", freq: "mwf", days: "mon,wed,fri", weeks: "4" })!;
    expect(s).toMatchObject({ planKey: "veg", mealSizeId: "msz_small", frequencyKey: "mwf", eatingDays: ["mon", "wed", "fri"], durationWeeks: 4 });
  });

  it("drops what no longer exists and ignores junk days", () => {
    const s = selectionsFromQuote(catalog, { plan: "veg", meal: "msz_gone", freq: "nope", days: "mon,funday" })!;
    expect(s).toMatchObject({ mealSizeId: "", frequencyKey: "", eatingDays: ["mon"] });
  });

  it("is null without a plan", () => {
    expect(selectionsFromQuote(catalog, { meal: "msz_small" })).toBeNull();
  });
});

describe("quote codes and forwarding", () => {
  it("keeps code-shaped values only, deduped and capped", () => {
    expect(quoteCodes({ codes: "extra5, TG-AB12,<script>,EXTRA5" })).toEqual(["EXTRA5", "TG-AB12"]);
  });

  it("forwards quote params alone", () => {
    expect(quoteQuery(new URLSearchParams("plan=veg&error=x&codes=A1"))).toBe("?plan=veg&codes=A1");
    expect(quoteQuery({})).toBe("");
  });
});
