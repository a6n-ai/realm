import { describe, expect, it } from "vitest";
import type { ClientCatalogSnapshot } from "@/lib/catalog/types";
import { quoteCodes, quoteCoins, quoteLinkQuery, quoteQuery, selectionsFromQuote } from "../selections";

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
    const s = selectionsFromQuote(catalog, { p: "veg", m: "msz_small", f: "mwf", d: "135", w: "4" })!;
    expect(s).toMatchObject({ planKey: "veg", mealSizeId: "msz_small", frequencyKey: "mwf", eatingDays: ["mon", "wed", "fri"], durationWeeks: 4 });
  });

  it("drops what no longer exists and ignores junk days", () => {
    const s = selectionsFromQuote(catalog, { p: "veg", m: "msz_gone", f: "nope", d: "19x" })!;
    expect(s).toMatchObject({ mealSizeId: "", frequencyKey: "", eatingDays: ["mon"] });
  });

  it("is null without a plan", () => {
    expect(selectionsFromQuote(catalog, { m: "msz_small" })).toBeNull();
  });
});

describe("quoteLinkQuery", () => {
  it("leaves out defaults and round-trips", () => {
    const base = { planKey: "veg", mealSizeId: "msz_small", frequencyKey: "mwf", durationWeeks: 1, codes: [] as string[] };
    expect(quoteLinkQuery({ ...base, eatingDays: ["mon", "tue", "wed", "thu", "fri"] })).toBe("p=veg&m=msz_small&f=mwf");
    const q = quoteLinkQuery({ ...base, eatingDays: ["fri", "mon", "wed"], durationWeeks: 4, codes: ["EXTRA5", "TG-AB12"] });
    expect(q).toBe("p=veg&m=msz_small&f=mwf&d=135&w=4&c=EXTRA5,TG-AB12");
    const params = Object.fromEntries(new URLSearchParams(q));
    expect(selectionsFromQuote(catalog, params)).toMatchObject({ eatingDays: ["mon", "wed", "fri"], durationWeeks: 4 });
    expect(quoteCodes(params)).toEqual(["EXTRA5", "TG-AB12"]);
  });
});

describe("quote codes and forwarding", () => {
  it("keeps code-shaped values only, deduped and capped", () => {
    expect(quoteCodes({ c: "extra5, TG-AB12,<script>,EXTRA5" })).toEqual(["EXTRA5", "TG-AB12"]);
  });

  it("forwards quote params alone", () => {
    expect(quoteQuery(new URLSearchParams("p=veg&error=x&c=A1"))).toBe("?p=veg&c=A1");
    expect(quoteQuery({})).toBe("");
  });
});

describe("quote coins (k)", () => {
  it("round-trips through the link and survives quoteQuery forwarding", () => {
    const q = quoteLinkQuery({ planKey: "veg", mealSizeId: "msz_small", frequencyKey: "mwf", eatingDays: ["mon"], durationWeeks: 1, codes: [], coins: 40 });
    const params = Object.fromEntries(new URLSearchParams(q));
    expect(quoteCoins(params)).toBe(40);
    expect(quoteQuery(new URLSearchParams(q))).toContain("k=40");
  });

  it("leaves k out at 0 and ignores junk", () => {
    expect(quoteLinkQuery({ planKey: "veg", mealSizeId: "m", frequencyKey: "f", eatingDays: [], durationWeeks: 1, codes: [], coins: 0 })).not.toContain("k=");
    expect(quoteCoins({ k: "-3" })).toBe(0);
    expect(quoteCoins({ k: "2.5" })).toBe(0);
    expect(quoteCoins({})).toBe(0);
  });
});
