import { describe, expect, it } from "vitest";
import { groupKitchenCounts } from "../kitchen-groups";

const c = (category: string, dish: string, portion: string | null, count: number) => ({
  category,
  categoryLabel: category[0]!.toUpperCase() + category.slice(1),
  dish,
  portion,
  count,
});

describe("groupKitchenCounts", () => {
  const groups = groupKitchenCounts([
    c("roti", "Roti", "2 roti", 30),
    c("roti", "Roti", "8 roti", 38),
    c("rice", "Rice", "1 unit", 147),
    c("rice", "Rice", "2 unit", 7),
    c("sabzi", "Aloo Matar", "8oz", 2),
    c("sabzi", "Veg Korma", "8oz", 162),
    c("sabzi", "Veg Korma", "12oz", 98),
  ]);

  it("totals packs, and pieces or weight in the category's own unit", () => {
    const roti = groups.find((g) => g.category === "roti")!;
    expect(roti.containers).toBe(68);
    expect(roti.total).toEqual({ amount: 2 * 30 + 8 * 38, unit: "roti" });
  });

  it("orders dishes by volume and portions largest first; a generic unit gets no total", () => {
    const sabzi = groups.find((g) => g.category === "sabzi")!;
    expect(sabzi.total).toEqual({ amount: 8 * 2 + 8 * 162 + 12 * 98, unit: "oz" });
    expect(groups.find((g) => g.category === "rice")!.total).toBeNull();
    expect(sabzi.containers).toBe(262);
    expect(sabzi.dishes.map((d) => d.dish)).toEqual(["Veg Korma", "Aloo Matar"]);
    expect(sabzi.dishes[0]!.portions.map((p) => p.portion)).toEqual(["12oz", "8oz"]);
  });
});
