import { describe, expect, it } from "vitest";
import { buildPosterColumns } from "../poster";

const tiffinSlots = [{ key: "lunch", label: "Lunch" }];
const healthySlots = [
  { key: "breakfast", label: "Breakfast" },
  { key: "lunch", label: "Lunch" },
  { key: "dinner", label: "Dinner" },
];

describe("buildPosterColumns", () => {
  it("single slot => flat group (slotLabel null), weekend merged, ordered by position", () => {
    const cols = buildPosterColumns(tiffinSlots, [
      { dayOfWeek: "mon", slot: "lunch", dishName: "Dal", diet: "veg", position: 1 },
      { dayOfWeek: "mon", slot: "lunch", dishName: "Paneer", diet: "veg", position: 0 },
      { dayOfWeek: "sun", slot: "lunch", dishName: "Chicken Pasta", diet: "nonveg", position: 1 },
      { dayOfWeek: "sat", slot: "lunch", dishName: "Veg Pasta", diet: "veg", position: 0 },
    ]);
    const mon = cols.find((c) => c.label === "Monday")!;
    expect(mon.groups).toHaveLength(1);
    expect(mon.groups[0].slotLabel).toBeNull();
    expect(mon.groups[0].dishes.map((d) => d.name)).toEqual(["Paneer", "Dal"]);
    const weekend = cols.find((c) => c.label === "Weekends")!;
    expect(weekend.groups[0].dishes.map((d) => d.name)).toEqual(["Veg Pasta", "Chicken Pasta"]);
  });

  it("multi slot => one group per slot in slot order", () => {
    const cols = buildPosterColumns(healthySlots, [
      { dayOfWeek: "mon", slot: "dinner", dishName: "Soup", diet: "veg", position: 0 },
      { dayOfWeek: "mon", slot: "breakfast", dishName: "Poha", diet: "veg", position: 0 },
    ]);
    const mon = cols.find((c) => c.label === "Monday")!;
    expect(mon.groups.map((g) => g.slotLabel)).toEqual(["Breakfast", "Lunch", "Dinner"]);
    expect(mon.groups[0].dishes.map((d) => d.name)).toEqual(["Poha"]);
    expect(mon.groups[1].dishes).toEqual([]);
    expect(mon.groups[2].dishes.map((d) => d.name)).toEqual(["Soup"]);
  });
});
