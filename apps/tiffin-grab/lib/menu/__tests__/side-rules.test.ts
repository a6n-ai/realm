import { describe, expect, it, vi } from "vitest";
import { rolesAfterSwaps, rolesByCategory, sideDefault, sideKey, sideOptions, type SideRules } from "../side-rules";

vi.mock("@/lib/auth", () => ({ auth: async () => null }));
const { resolveCategoriesForDay } = await import("../resolve-delivery-meal");

const VEG = 1n;
const NONVEG = 2n;
const dish = (id: number, name: string, planId: bigint, slot: string, isDefault = false) =>
  ({ slot, dishId: BigInt(id), isDefault, name, publicId: `d${id}`, planId });

const korma = dish(1, "Veg Korma", VEG, "sabzi", true);
const chicken = dish(2, "Chicken Home Style", NONVEG, "sabzi");
const masoor = dish(3, "Masoor Dal", VEG, "daal", true);
const toorDal = dish(4, "Toor Dal", VEG, "daal");
const menu = [korma, chicken, masoor, toorDal];
const all = new Set(menu.map((m) => m.dishId));
const cats = [
  { key: "sabzi", selectable: true, label: "Sabzi", tuUnitType: "weight" },
  { key: "daal", selectable: false, label: "Dal", tuUnitType: "weight" },
];
const dalSide: SideRules = new Map([[sideKey("sabzi", "side_1"), { sourceCategory: "daal" }]]);

// 5 Item Regular: two 8oz sabzis (main, side_1) + dal. Weight can't tell them apart; role can.
const fiveItemRegular = rolesByCategory([
  { category: "sabzi", sortOrder: 0, role: "main" },
  { category: "sabzi", sortOrder: 1, role: "side_1" },
  { category: "daal", sortOrder: 2, role: "main" },
]);

const sideFor = (roles: ReturnType<typeof rolesByCategory>, rules: SideRules, items = menu) =>
  (category: string, pickIndex: number) => {
    const role = roles.get(category)?.[pickIndex - 1];
    return role && role !== "main" ? sideOptions(rules.get(sideKey(category, role)), items, all) : [];
  };

const sabzi = (picks: { slot: string; pickIndex: number; dishId: bigint }[], side: ReturnType<typeof sideFor> | null, items = menu) =>
  resolveCategoriesForDay(items, picks, cats, { sabzi: 2, daal: 1 }, all, new Set(), new Map([["sabzi", 1]]), [], null, side)
    .find((c) => c.category === "sabzi")!.picks.map((p) => p.name);

describe("side picks follow the day's side rule", () => {
  it("orders roles by sortOrder within each category", () => {
    expect(fiveItemRegular.get("sabzi")).toEqual(["main", "side_1"]);
    expect(fiveItemRegular.get("daal")).toEqual(["main"]);
  });

  it("packs the day's dal as the side while the main stays the day's sabzi", () => {
    expect(sabzi([], sideFor(fiveItemRegular, dalSide))).toEqual(["Veg Korma", "Masoor Dal"]);
  });

  it("keeps today's behaviour with no rule", () => {
    expect(sabzi([], null)).toEqual(["Veg Korma", "Veg Korma"]);
    expect(sabzi([], sideFor(fiveItemRegular, new Map()))).toEqual(["Veg Korma", "Veg Korma"]);
  });

  it("uses a fixed dish when the day names one", () => {
    const toor = dish(9, "Toor Dal", VEG, "daal");
    const rules: SideRules = new Map([[sideKey("sabzi", "side_1"), { dish: toor }]]);
    expect(sabzi([], sideFor(fiveItemRegular, rules))).toEqual(["Veg Korma", "Toor Dal"]);
  });

  it("falls back to the sabzi when the source category has nothing that day", () => {
    const noDal = [korma, chicken];
    expect(sabzi([], sideFor(fiveItemRegular, dalSide, noDal), noDal)).toEqual(["Veg Korma", "Veg Korma"]);
  });

  it("leaves a one-sabzi meal untouched", () => {
    const fourItem = rolesByCategory([{ category: "sabzi", sortOrder: 0, role: "main" }]);
    const picks = resolveCategoriesForDay(menu, [], cats, { sabzi: 1, daal: 1 }, all, new Set(), new Map(), [], null, sideFor(fourItem, dalSide))
      .find((c) => c.category === "sabzi")!.picks.map((p) => p.name);
    expect(picks).toEqual(["Veg Korma"]);
  });

  it("lets a customer's own pick win over the side rule", () => {
    expect(sabzi([{ slot: "sabzi", pickIndex: 2, dishId: korma.dishId }], sideFor(fiveItemRegular, dalSide))).toEqual(["Veg Korma", "Veg Korma"]);
  });

  it("keeps a side pick of another of the day's dals", () => {
    expect(sabzi([{ slot: "sabzi", pickIndex: 2, dishId: toorDal.dishId }], sideFor(fiveItemRegular, dalSide))).toEqual(["Veg Korma", "Toor Dal"]);
  });

  it("offers every dal of the day to a side pick, the default one as its default", () => {
    const rule = dalSide.get(sideKey("sabzi", "side_1"));
    expect(sideOptions(rule, menu, all).map((i) => i.name)).toEqual(["Masoor Dal", "Toor Dal"]);
    expect(sideDefault(rule, [toorDal, masoor], all)?.name).toBe("Masoor Dal");
    expect(sideFor(fiveItemRegular, dalSide)("sabzi", 1)).toEqual([]); // the main pick has none
  });
});

describe("rolesAfterSwaps (Muskan, 2026-10-08)", () => {
  const maharaja = new Map([["sabzi", ["main", "side_1"] as ("main" | "side_1")[]], ["daal", ["main"] as "main"[]]]);
  const swap = { fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 };

  it("the 8oz side stays a side when the 12oz main is swapped for dal", () => {
    expect(rolesAfterSwaps(maharaja, [{ ...swap, fromRow: 0 }])?.get("sabzi")).toEqual(["side_1"]);
    // What the swap brings is a main: no side rule applies to it.
    expect(rolesAfterSwaps(maharaja, [{ ...swap, fromRow: 0 }])?.get("daal")).toEqual(["main", "main"]);
  });

  it("swapping the side away leaves the main a main; no swaps changes nothing", () => {
    expect(rolesAfterSwaps(maharaja, [{ ...swap, fromRow: 1 }])?.get("sabzi")).toEqual(["main"]);
    expect(rolesAfterSwaps(maharaja, [])).toBe(maharaja);
  });
});
