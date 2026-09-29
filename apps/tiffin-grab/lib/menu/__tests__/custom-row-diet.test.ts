import { describe, expect, it, vi } from "vitest";
import { rowPlanIds } from "../row-plans";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { resolveCategoriesForDay } = await import("../resolve-delivery-meal");

const VEG = 1n;
const NONVEG = 2n;
const dish = (id: number, name: string, planId: bigint, slot = "sabzi", isDefault = false) =>
  ({ slot, dishId: BigInt(id), isDefault, name, publicId: `d${id}`, planId });

const paneer = dish(1, "Patta Gobhi Matar", VEG, "sabzi", true);
const chicken = dish(2, "Kadai Chicken", NONVEG);
const kofta = dish(3, "Chicken Kofta Curry", NONVEG);
const vegRaita = dish(4, "Boondi Raita", VEG, "raita");
const nvRaita = dish(5, "Boondi Raita (Non-Veg)", NONVEG, "raita", true);
const menu = [paneer, chicken, kofta, vegRaita, nvRaita];
const cats = [
  { key: "sabzi", selectable: true, label: "Sabzi", tuUnitType: "weight" },
  { key: "raita", selectable: false, label: "Raita", tuUnitType: "weight" },
];
// Custom meal: 1 Non-Veg Sabzi 8oz + 1 Veg Sabzi 12oz + 1 Veg Sabzi 8oz (add-on) + 1 Veg Raita.
const rows = rowPlanIds([
  { category: "raita", planId: VEG, sortOrder: 0 },
  { category: "sabzi", planId: NONVEG, sortOrder: 3 },
  { category: "sabzi", planId: VEG, sortOrder: 4 },
  { category: "sabzi", planId: VEG, sortOrder: 5 },
], true);
const all = new Set(menu.map((m) => m.dishId));
const nonVegOnly = new Set([chicken.dishId, kofta.dishId]);
// The 12oz veg row (pick 2) is the largest — the catalog rule would put chicken there.
const maxTu = new Map([["sabzi", 2], ["raita", 1]]);

const resolve = (picks: { slot: string; pickIndex: number; dishId: bigint }[] = []) =>
  resolveCategoriesForDay(menu, picks, cats, { sabzi: 3, raita: 1 }, all, nonVegOnly, maxTu, [], rows);

describe("custom meal rows resolve within their own diet", () => {
  it("defaults the non-veg row to a non-veg dish and every veg row (incl. the add-on) to a veg dish", () => {
    const sabzi = resolve().find((c) => c.category === "sabzi")!;
    expect(sabzi.picks.map((p) => p.name)).toEqual(["Kadai Chicken", "Patta Gobhi Matar", "Patta Gobhi Matar"]);
  });

  it("serves a fixed veg raita row the veg raita even when the non-veg one is the menu default", () => {
    expect(resolve().find((c) => c.category === "raita")!.picks[0]!.name).toBe("Boondi Raita");
  });

  it("drops a saved pick of the wrong diet for its row back to that row's default", () => {
    const sabzi = resolve([
      { slot: "sabzi", pickIndex: 1, dishId: kofta.dishId },
      { slot: "sabzi", pickIndex: 3, dishId: chicken.dishId },
    ]).find((c) => c.category === "sabzi")!;
    expect(sabzi.picks.map((p) => [p.name, p.isDefaulted])).toEqual([
      ["Chicken Kofta Curry", false],
      ["Patta Gobhi Matar", true],
      ["Patta Gobhi Matar", true],
    ]);
  });
});
