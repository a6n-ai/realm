import { describe, expect, it } from "vitest";
import { splitMealAddons, type MealCategory } from "../trip-parts";

const item = (name: string, portion: string) => ({ name, portion });
const cats: MealCategory[] = [
  { category: "sabzi", label: "Sabzi", items: [item("Paneer Makhani", "12oz"), item("Gobhi Aloo", "12oz")] },
  { category: "roti", label: "Roti", items: [item("Roti", "2 roti")] },
];

describe("splitMealAddons", () => {
  it("takes a row add-on's last pick out of the meal, and lists a folded add-on with its own total", () => {
    const { meal, addons } = splitMealAddons(cats, [
      { name: "Extra Sabzi", qty: 1, category: "sabzi", folded: false, portion: "12oz" },
      { name: "Extra Roti", qty: 2, category: "roti", folded: true, portion: "2 roti" },
    ]);
    expect(meal.find((c) => c.category === "sabzi")!.items.map((i) => i.name)).toEqual(["Paneer Makhani"]);
    expect(meal.find((c) => c.category === "roti")!.items[0]!.portion).toBe("2 roti");
    expect(addons).toEqual([
      { category: "sabzi", label: "Sabzi", items: [item("Gobhi Aloo", "12oz")] },
      { category: "roti", label: "Roti", items: [{ name: "Roti", portion: "2 roti" }] },
    ]);
  });

  it("no add-ons: the meal is untouched", () => {
    expect(splitMealAddons(cats).meal).toEqual(cats);
  });
});
