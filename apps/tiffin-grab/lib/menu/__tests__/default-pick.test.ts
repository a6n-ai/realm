import { describe, expect, it } from "vitest";
import { defaultMenuItem, maxTuPickIndex } from "../default-pick";

const item = (dishId: bigint, isDefault = false) => ({ dishId, isDefault });

describe("maxTuPickIndex", () => {
  it("is 1-based and prefers the largest TU, breaking ties by sortOrder", () => {
    expect(
      maxTuPickIndex([
        { tuAmount: "1.00", sortOrder: 2 },
        { tuAmount: "1.50", sortOrder: 0 },
        { tuAmount: "1.00", sortOrder: 1 },
      ]),
    ).toBe(1);
  });

  it("picks the first of two equal max-TU rows — only one exclusive dish is assigned", () => {
    expect(
      maxTuPickIndex([
        { tuAmount: "1.50", sortOrder: 0 },
        { tuAmount: "1.50", sortOrder: 1 },
        { tuAmount: "1.00", sortOrder: 2 },
      ]),
    ).toBe(1);
  });

  it("is null when the meal size has no lines for that category", () => {
    expect(maxTuPickIndex([])).toBeNull();
  });
});

describe("defaultMenuItem", () => {
  const paneer = item(1n, true);
  const bhindi = item(2n);
  const chicken = item(3n);
  const slot = [paneer, bhindi, chicken];
  const exclusive = new Set<bigint>([3n]);

  it("uses the marked isDefault when the pick is not the max-TU slot", () => {
    expect(defaultMenuItem(slot, 2, { exclusiveDishIds: exclusive, maxTuPickIndex: 1 })).toBe(paneer);
  });

  it("uses a dish no restricted plan offers on the max-TU pick", () => {
    expect(defaultMenuItem(slot, 1, { exclusiveDishIds: exclusive, maxTuPickIndex: 1 })).toBe(chicken);
  });

  it("falls back to isDefault when no exclusive dish is on the day's menu", () => {
    expect(
      defaultMenuItem([paneer, bhindi], 1, { exclusiveDishIds: exclusive, maxTuPickIndex: 1 }),
    ).toBe(paneer);
  });
});
