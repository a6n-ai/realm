import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/catalog/load", () => ({ loadCatalogSnapshot: vi.fn() }));
vi.mock("@/lib/services/app-settings.service", () => ({ getAppSettings: vi.fn() }));
vi.mock("@/lib/services/trial-settings.service", () => ({ getTrialSettings: vi.fn() }));

import { buildFaq } from "../faq-list";
import { llmsTxt, pricingMd } from "../llms-text";
import { buildFacts } from "../site-facts";
import type { CatalogSnapshot } from "@/lib/catalog/types";

const size = (planKey: string, key: string, basePrice: number, trial = false) => ({
  id: 1n, publicId: key, key, name: `${key} size`, description: null, planId: 1n, planKey, tier: "budget", components: ["Sabzi", "Dal", "Roti"],
  items: [], kcalMin: 500, kcalMax: 650, proteinG: 20, carbsG: null, fatG: null, basePrice, discountType: "none", discountValue: 0, trial, custom: false, priceable: true, servesWeekends: false,
});
const catalog = {
  plans: [
    { id: 1n, publicId: "p1", key: "veg", name: "Veg", description: "Vegetarian", planType: "tiffin", offeredSlots: [], allowedStartDays: [] },
    { id: 2n, publicId: "p2", key: "non-veg", name: "Non-veg", description: null, planType: "tiffin", offeredSlots: [], allowedStartDays: [] },
  ],
  mealSizes: [size("veg", "v1", 9), size("veg", "v2", 12), size("veg", "vt", 7, true), size("non-veg", "n1", 13)],
  frequencies: [],
  durations: [{ id: 1n, publicId: "d4", weeks: 4 }],
  zones: [
    { id: 1n, publicId: "z1", name: "Brampton", radiusKm: null, postalPrefixes: ["L6"], slotWindow: "11:00 AM – 2:00 PM", active: true },
    { id: 2n, publicId: "z2", name: "Oakville", radiusKm: null, postalPrefixes: ["L6H"], slotWindow: "4:00 PM – 7:00 PM", active: true },
    { id: 3n, publicId: "z3", name: "Closed", radiusKm: null, postalPrefixes: [], slotWindow: null, active: false },
  ],
  cutoffHour: 18,
  discounts: [{ key: "d", name: "4 weeks", kind: "duration", targetPublicId: null, percent: 5, minWeeks: 4 }],
} as unknown as CatalogSnapshot;
const facts = buildFacts(catalog, "CAD", { maxDays: 3, weekdays: ["mon", "tue", "wed"] });
const words = (s: string) => s.trim().split(/\s+/).length;

describe("buildFaq", () => {
  const groups = buildFaq(facts, "Give $15, get $15.");
  const all = groups.flatMap((g) => g.items);

  it("has 20 to 30 questions in grouped headings, with unique questions", () => {
    expect(all.length).toBeGreaterThanOrEqual(20);
    expect(all.length).toBeLessThanOrEqual(30);
    expect(new Set(all.map((i) => i.q)).size).toBe(all.length);
  });

  it("keeps answers short (the area list is the one long answer)", () => {
    const bad = all.filter((i) => i.q !== "Where do you deliver?" && (words(i.a) < 38 || words(i.a) > 65)).map((i) => `${words(i.a)} ${i.q}`);
    expect(bad).toEqual([]);
  });

  it("uses live values and skips what has no data", () => {
    const text = all.map((i) => i.a).join(" ");
    expect(text).toContain("from $9");
    expect(text).toContain("6 PM");
    expect(text).toContain("5% off every tiffin for 4 weeks or more");
    expect(text).toContain("up to 3 days");
    expect(text).not.toMatch(/jain/i);
    const bare = buildFaq({ ...facts, from: null, cutoff: null, weeksOff: [], trial: null, areas: [], runs: [], plans: [] }, null).flatMap((g) => g.items.map((i) => i.q));
    for (const q of ["Where do you deliver?", "Can I try before I commit?", "Do longer plans cost less?", "Is there a referral reward?", "What is the cutoff to change or pause a day?", "What meal sizes are there?"]) expect(bare).not.toContain(q);
  });
});

describe("llms and pricing.md", () => {
  it("llms.txt links final urls and states the facts", () => {
    const t = llmsTxt(facts, "https://tiffingrab.ca", { reviews: false });
    expect(t).toContain("[Pricing](https://tiffingrab.ca/pricing)");
    expect(t).toContain("[Menu](https://tiffingrab.ca/menu)");
    expect(t).not.toMatch(/\/plans|menu\/weekly|\/reviews/);
    expect(t).toContain("from $9.00 a tiffin, up to $13.00");
    expect(t).toContain("- 11 AM to 2 PM: Brampton");
    expect(llmsTxt(facts, "https://tiffingrab.ca", { reviews: true })).toContain("/reviews");
  });

  it("pricing.md lists every size incl. trial", () => {
    const t = pricingMd(facts, "https://tiffingrab.ca");
    expect(t).toContain("## Veg");
    expect(t).toContain("| vt size (trial) | Sabzi, Dal, Roti | 500 to 650 kcal | 20 g | $7.00 |");
    expect(t).toContain("| n1 size |");
    expect(t).toContain("4 weeks or more: 5% off every tiffin");
  });
});
