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

  it("counts a dish once where it is mostly served, even when another slot also offers it", () => {
    const g = groupKitchenCounts([
      c("daal", "Kali Dal", "12oz", 101),
      c("daal", "Kali Dal", "8oz", 85),
      c("sabzi", "Kali Dal", "8oz", 57),
      c("sabzi", "Aloo Matar", "12oz", 156),
    ]);
    const daal = g.find((x) => x.category === "daal")!;
    expect(daal.dishes[0]!.portions).toEqual([{ portion: "12oz", count: 101 }, { portion: "8oz", count: 142 }]);
    expect(daal.containers).toBe(243);
    expect(g.find((x) => x.category === "sabzi")!.dishes.map((d) => d.dish)).toEqual(["Aloo Matar"]);
  });

  it("totals packs and, for count units, pieces", () => {
    const roti = groups.find((g) => g.category === "roti")!;
    expect(roti.containers).toBe(68);
    expect(roti.pieces).toEqual({ amount: 2 * 30 + 8 * 38, unit: "roti" });
  });

  it("orders dishes by volume and portions largest first; weights get no piece total", () => {
    const sabzi = groups.find((g) => g.category === "sabzi")!;
    expect(sabzi.pieces).toBeNull();
    expect(groups.find((g) => g.category === "rice")!.pieces).toBeNull();
    expect(sabzi.containers).toBe(262);
    expect(sabzi.dishes.map((d) => d.dish)).toEqual(["Veg Korma", "Aloo Matar"]);
    expect(sabzi.dishes[0]!.portions.map((p) => p.portion)).toEqual(["12oz", "8oz"]);
  });
});
