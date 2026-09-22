import { describe, expect, it } from "vitest";
import {
  categoryPortionSlotsForMealSize,
  categoryPortionSlotsFromItems,
  categoryPortionsForMealSize,
  categoryPortionsFromItems,
} from "../category-portions";

describe("categoryPortionsFromItems", () => {
  it("keeps the first human portion per category", () => {
    expect(
      categoryPortionsFromItems([
        { category: "sabzi", portion: "12oz" },
        { category: "sabzi", portion: "8oz" },
        { category: "roti", portion: "1 roti" },
        { category: "dal", portion: null },
      ]),
    ).toEqual({ sabzi: "12oz", roti: "1 roti" });
  });
});

describe("categoryPortionSlotsFromItems", () => {
  it("keeps every composition-row portion in order", () => {
    expect(
      categoryPortionSlotsFromItems([
        { category: "sabzi", portion: "12oz" },
        { category: "sabzi", portion: "12oz" },
        { category: "sabzi", portion: "8oz" },
        { category: "roti", portion: "4 roti" },
        { category: "dal", portion: null },
      ]),
    ).toEqual({ sabzi: ["12oz", "12oz", "8oz"], roti: ["4 roti"] });
  });
});

describe("categoryPortionsForMealSize", () => {
  it("looks up the meal size by id", () => {
    const portions = categoryPortionsForMealSize(
      [
        { id: 1n, items: [{ category: "sabzi", portion: "8oz" }] },
        { id: 2n, items: [{ category: "roti", portion: "4 roti" }] },
      ],
      2n,
    );
    expect(portions).toEqual({ roti: "4 roti" });
  });
});

describe("categoryPortionSlotsForMealSize", () => {
  it("looks up slot arrays by meal size id", () => {
    const slots = categoryPortionSlotsForMealSize(
      [
        { id: 1n, items: [{ category: "sabzi", portion: "12oz" }, { category: "sabzi", portion: "8oz" }] },
        { id: 2n, items: [{ category: "roti", portion: "4 roti" }] },
      ],
      1n,
    );
    expect(slots).toEqual({ sabzi: ["12oz", "8oz"] });
  });
});
