import { describe, expect, it } from "vitest";
import { validateSwapStack } from "@/lib/menu/resolve-delivery-meal";

const base = { sabzi: 2, dal: 1, roti: 4 };

describe("validateSwapStack", () => {
  it("allows a swap the base composition can afford", () => {
    expect(validateSwapStack(base, [], { fromCategory: "roti", toCategory: "rice", qtyFrom: 2, qtyTo: 1 }))
      .toEqual({ ok: true });
  });

  it("rejects a swap that would overdraw the from-category", () => {
    const r = validateSwapStack(base, [], { fromCategory: "dal", toCategory: "rice", qtyFrom: 2, qtyTo: 1 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain("dal");
  });

  it("counts already-applied swaps before deciding", () => {
    const applied = [{ fromCategory: "roti", toCategory: "rice", qtyFrom: 2, qtyTo: 1 }];
    // 4 roti - 2 = 2 left, so a second 2-roti swap is exactly affordable.
    expect(validateSwapStack(base, applied, { fromCategory: "roti", toCategory: "dal", qtyFrom: 2, qtyTo: 1 }))
      .toEqual({ ok: true });
    // A third is not.
    const twice = [...applied, { fromCategory: "roti", toCategory: "dal", qtyFrom: 2, qtyTo: 1 }];
    expect(validateSwapStack(base, twice, { fromCategory: "roti", toCategory: "dal", qtyFrom: 1, qtyTo: 1 }).ok)
      .toBe(false);
  });

  it("rejects a category the composition does not contain at all", () => {
    expect(validateSwapStack(base, [], { fromCategory: "paneer", toCategory: "rice", qtyFrom: 1, qtyTo: 1 }).ok)
      .toBe(false);
  });
});
