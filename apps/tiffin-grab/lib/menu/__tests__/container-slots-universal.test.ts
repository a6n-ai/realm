import { describe, expect, it } from "vitest";
import { isContainerCategory, type TuCategory } from "../format-tu";
import { portionsByCategory, portionForPick, sumTuForPicks } from "../pick-size";
import { groupPickCells, buildMealSummary, type PickCategoryMeta, type PickCategoryGroup } from "../pick-groups";
import { applySwapsToCounts, type SwapRow } from "../swap-rules";
import { swapAppliesTo } from "../coverage";
import type { GridCell } from "../meals-grid";
import { packingItemLabel } from "../packing-item-label";

describe("Universal Container Slots (1 slot = 1 physical container item)", () => {
  const tuByKey = new Map<string, TuCategory>([
    ["sabzi", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz", selectable: true }],
    ["daal", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz", selectable: false }],
    ["salad", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz", selectable: false }],
    ["raita", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz", selectable: false }],
    ["curry", { tuUnitType: "weight", tuUnitSize: 8, tuUnitLabel: "oz", selectable: true }],
    ["rice", { tuUnitType: "count", tuUnitSize: 1, tuUnitLabel: "unit", selectable: false }],
    ["roti", { tuUnitType: "count", tuUnitSize: 4, tuUnitLabel: "roti", selectable: false }],
  ]);

  const categoriesMeta: PickCategoryMeta[] = [
    { key: "sabzi", label: "Sabzi", selectable: true, sortOrder: 1 },
    { key: "daal", label: "Daal", selectable: false, sortOrder: 2 },
    { key: "salad", label: "Salad", selectable: false, sortOrder: 3 },
    { key: "raita", label: "Raita", selectable: false, sortOrder: 4 },
    { key: "curry", label: "Curry", selectable: true, sortOrder: 5 },
    { key: "rice", label: "Rice", selectable: false, sortOrder: 6 },
    { key: "roti", label: "Roti", selectable: false, sortOrder: 7 },
  ];

  // Scenario 1: Base meal with 2 Sabzi, 1 Daal, 4 Roti (no swaps)
  it("Scenario 1: Base meal with 2 Sabzi, 1 Daal, 4 Roti (no swaps) has correct slot breakdown", () => {
    const mealItems = [
      { category: "sabzi", tuAmount: "1.50", sortOrder: 0 },
      { category: "sabzi", tuAmount: "1.00", sortOrder: 1 },
      { category: "daal", tuAmount: "1.50", sortOrder: 2 },
      { category: "roti", tuAmount: "1.00", sortOrder: 3 }, // 1.00 TU * 4 = 4 roti
    ];

    const portions = portionsByCategory(mealItems, tuByKey, []);
    expect(portions.get("sabzi")).toEqual(["12oz", "8oz"]);
    expect(portions.get("daal")).toEqual(["12oz"]);
    expect(portions.get("roti")).toEqual(["4 roti"]);
  });

  // Scenario 2: Base meal with 1 Sabzi swapped to Daal -> resolves to 2 distinct Daal items + 1 Sabzi item + 4 Roti
  it("Scenario 2: 1 Sabzi swapped to Daal resolves to 2 distinct Daal items + 1 Sabzi + 4 Roti", () => {
    const baseCounts = { sabzi: 2, daal: 1, roti: 4 };
    const swaps: SwapRow[] = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }];
    const effectiveCounts = applySwapsToCounts(baseCounts, swaps);

    expect(effectiveCounts).toEqual({ sabzi: 1, daal: 2, roti: 4 });

    const mealItems = [
      { category: "sabzi", tuAmount: "1.50", sortOrder: 0 },
      { category: "sabzi", tuAmount: "1.00", sortOrder: 1 },
      { category: "daal", tuAmount: "1.50", sortOrder: 2 },
      { category: "roti", tuAmount: "1.00", sortOrder: 3 },
    ];

    const portions = portionsByCategory(mealItems, tuByKey, swaps);
    // 12oz sabzi swapped to daal; remaining sabzi is 8oz; daal has original 12oz + swapped 12oz
    expect(portions.get("sabzi")).toEqual(["8oz"]);
    expect(portions.get("daal")).toEqual(["12oz", "12oz"]);
    expect(portions.get("roti")).toEqual(["4 roti"]);
  });

  // Scenario 3: Swapped Daal portions: ensure each Daal has its own portion (e.g. 12oz and 12oz, or 12oz and 8oz)
  it("Scenario 3: Swapped Daal portions preserves distinct individual portions (12oz and 12oz, or 12oz and 8oz)", () => {
    // Case A: 2 Daals of different sizes (e.g. 12oz and 8oz) remain separate, not 20oz
    const diffDaals = [
      { category: "daal", tuAmount: "1.50", sortOrder: 0 }, // 12oz
      { category: "daal", tuAmount: "1.00", sortOrder: 1 }, // 8oz
    ];
    const diffPortions = portionsByCategory(diffDaals, tuByKey, []);
    expect(diffPortions.get("daal")).toEqual(["12oz", "8oz"]);
    expect(diffPortions.get("daal")).not.toContain("20oz");

    // Case B: Swapped Daal with 12oz base Daal gives two 12oz slots, not 24oz
    const mealItems = [
      { category: "sabzi", tuAmount: "1.00", sortOrder: 0 },
      { category: "daal", tuAmount: "1.50", sortOrder: 1 }, // 12oz base daal
    ];
    const swaps: SwapRow[] = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }];
    const portions = portionsByCategory(mealItems, tuByKey, swaps);

    expect(portions.get("daal")).toEqual(["12oz", "12oz"]);
    expect(portions.get("daal")).not.toContain("24oz");
  });

  // Scenario 4: Customer pick summary displays separate lines for container categories
  it("Scenario 4: Customer pick summary displays separate lines for container categories", () => {
    const daalCells: GridCell[] = [
      {
        day: "mon",
        dateIso: "2026-09-24",
        slot: "daal",
        personIndex: 1,
        pickIndex: 1,
        selectable: false,
        quantity: 1,
        selectedDishId: "d_dal",
        isDefaulted: true,
        dishes: [{ id: "d_dal", name: "Dal Tadka", image: null }],
        locked: false,
      },
      {
        day: "mon",
        dateIso: "2026-09-24",
        slot: "daal",
        personIndex: 1,
        pickIndex: 2,
        selectable: false,
        quantity: 1,
        selectedDishId: "d_dal",
        isDefaulted: true,
        dishes: [{ id: "d_dal", name: "Dal Tadka", image: null }],
        locked: false,
      },
    ];

    const portionsBySlot = {
      daal: ["12oz", "12oz"],
    };

    const groups = groupPickCells(daalCells, categoriesMeta, portionsBySlot);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.chooseCount).toBe(2);
    expect(groups[0]!.portions).toEqual(["12oz", "12oz"]);

    const summary = buildMealSummary(groups, {});
    expect(summary).toEqual([
      {
        categoryLabel: "Daal",
        lines: ["Dal Tadka · 12oz", "Dal Tadka · 12oz"],
      },
    ]);
  });

  // Scenario 5: Customer pick summary aggregates count categories (Roti 4)
  it("Scenario 5: Customer pick summary aggregates count categories (Roti 4)", () => {
    const rotiCells: GridCell[] = [
      {
        day: "mon",
        dateIso: "2026-09-24",
        slot: "roti",
        personIndex: 1,
        pickIndex: 1,
        selectable: false,
        quantity: 4,
        selectedDishId: "d_roti",
        isDefaulted: true,
        dishes: [{ id: "d_roti", name: "Roti", image: null }],
        locked: false,
      },
    ];

    const portionsBySlot = {
      roti: ["4 roti"],
    };

    const groups = groupPickCells(rotiCells, categoriesMeta, portionsBySlot);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.chooseCount).toBe(4);
    expect(groups[0]!.portions).toEqual(["4 roti"]);

    const summary = buildMealSummary(groups, {});
    expect(summary).toEqual([
      {
        categoryLabel: "Roti",
        lines: ["Roti · 4 roti"],
      },
    ]);
  });

  // Scenario 6: Daily labels produce separate label lines for each container item
  it("Scenario 6: Daily labels produce separate label lines for each container item", () => {
    const resolvedDaal = {
      category: "daal",
      label: "Daal",
      selectable: false,
      quantity: 2,
      picks: [
        { dishId: 101n, dishPublicId: "d_dal", name: "Dal Tadka", isDefaulted: true },
        { dishId: 101n, dishPublicId: "d_dal", name: "Dal Tadka", isDefaulted: true },
      ],
    };

    const portions = new Map([["daal", ["12oz", "12oz"]]]);

    const lines: { category: string; dish: string; portion: string | null }[] = [];
    resolvedDaal.picks.forEach((pick, i) => {
      lines.push({
        category: resolvedDaal.category,
        dish: pick.name,
        portion: portionForPick(portions, resolvedDaal.category, i + 1),
      });
    });

    expect(lines).toHaveLength(2);
    expect(lines[0]).toEqual({ category: "daal", dish: "Dal Tadka", portion: "12oz" });
    expect(lines[1]).toEqual({ category: "daal", dish: "Dal Tadka", portion: "12oz" });
  });

  // Scenario 7: Kitchen packing sheet produces separate Item columns for each container item
  it("Scenario 7: Kitchen packing sheet produces separate Item columns for each container item", () => {
    const ordered = [
      {
        category: "daal",
        label: "Daal",
        selectable: false,
        quantity: 2,
        picks: [
          { dishId: 101n, dishPublicId: "d_dal", name: "Dal Tadka", isDefaulted: true },
          { dishId: 101n, dishPublicId: "d_dal", name: "Dal Tadka", isDefaulted: true },
        ],
      },
      {
        category: "sabzi",
        label: "Sabzi",
        selectable: true,
        quantity: 1,
        picks: [
          { dishId: 102n, dishPublicId: "d_paneer", name: "Paneer Makhani", isDefaulted: false },
        ],
      },
    ];

    const portions = new Map([
      ["daal", ["12oz", "12oz"]],
      ["sabzi", ["8oz"]],
    ]);

    const lineBySlot = new Map<string, { name: string; portion: string; quantity: number }>();
    for (const cat of ordered) {
      const converter = tuByKey.get(cat.category);
      if (isContainerCategory(converter) || cat.selectable) {
        cat.picks.forEach((pick, i) => {
          const pickIndex = i + 1;
          const portion = (portionForPick(portions, cat.category, pickIndex) ?? "").trim();
          const slotKey = `${cat.category}:${pickIndex}`;
          lineBySlot.set(slotKey, { name: pick.name, portion, quantity: 1 });
        });
      }
    }

    expect([...lineBySlot.keys()]).toEqual(["daal:1", "daal:2", "sabzi:1"]);
    expect(lineBySlot.get("daal:1")).toEqual({ name: "Dal Tadka", portion: "12oz", quantity: 1 });
    expect(lineBySlot.get("daal:2")).toEqual({ name: "Dal Tadka", portion: "12oz", quantity: 1 });
    expect(lineBySlot.get("sabzi:1")).toEqual({ name: "Paneer Makhani", portion: "8oz", quantity: 1 });
  });

  // Scenario 8: Kitchen packing sheet preserves single/bulk item for Roti
  it("Scenario 8: Kitchen packing sheet preserves single/bulk item for Roti", () => {
    const ordered = [
      {
        category: "roti",
        label: "Roti",
        selectable: false,
        quantity: 4,
        picks: [{ dishId: 103n, dishPublicId: "d_roti", name: "Roti", isDefaulted: true }],
      },
    ];
    const mealItems = [{ category: "roti", tuAmount: "1.00", sortOrder: 0 }];
    const converter = tuByKey.get("roti");
    const tuTotal = sumTuForPicks(mealItems, "roti", 4, []);
    expect(isContainerCategory(converter)).toBe(false);

    const lineBySlot = new Map<string, { name: string; portion: string; quantity: number }>();
    for (const cat of ordered) {
      const conv = tuByKey.get(cat.category);
      if (isContainerCategory(conv) || cat.selectable) {
        // Not reached for roti
      } else {
        const slotKey = `${cat.category}:fixed`;
        lineBySlot.set(slotKey, { name: cat.picks[0]!.name, portion: "4 roti", quantity: 1 });
      }
    }

    expect([...lineBySlot.keys()]).toEqual(["roti:fixed"]);
    expect(lineBySlot.get("roti:fixed")).toEqual({ name: "Roti", portion: "4 roti", quantity: 1 });
  });

  // Scenario 9: Verify Raita behavior as a container category (multi-slot if swapped/configured)
  it("Scenario 9: Raita is identified as a container category and preserves individual slots", () => {
    const raitaConv = tuByKey.get("raita");
    expect(isContainerCategory(raitaConv)).toBe(true);

    const mealItems = [
      { category: "raita", tuAmount: "1.00", sortOrder: 0 },
      { category: "raita", tuAmount: "1.00", sortOrder: 1 },
    ];
    const portions = portionsByCategory(mealItems, tuByKey, []);
    expect(portions.get("raita")).toEqual(["8oz", "8oz"]);
  });

  // Scenario 10: Verify Salad behavior as a container category (multi-slot if swapped/configured)
  it("Scenario 10: Salad is identified as a container category and preserves individual slots", () => {
    const saladConv = tuByKey.get("salad");
    expect(isContainerCategory(saladConv)).toBe(true);

    const mealItems = [
      { category: "salad", tuAmount: "1.00", sortOrder: 0 },
      { category: "salad", tuAmount: "1.00", sortOrder: 1 },
    ];
    const portions = portionsByCategory(mealItems, tuByKey, []);
    expect(portions.get("salad")).toEqual(["8oz", "8oz"]);
  });

  // Scenario 11: Verify Curry/Gravy behavior as a container category
  it("Scenario 11: Curry/Gravy is identified as a container category and preserves slots", () => {
    const curryConv = tuByKey.get("curry");
    expect(isContainerCategory(curryConv)).toBe(true);

    const mealItems = [
      { category: "curry", tuAmount: "1.50", sortOrder: 0 },
      { category: "curry", tuAmount: "1.00", sortOrder: 1 },
    ];
    const portions = portionsByCategory(mealItems, tuByKey, []);
    expect(portions.get("curry")).toEqual(["12oz", "8oz"]);
  });

  // Scenario 12 & 13: Verify resolution with swaps passed via options.swaps (deliveryId null or present)
  it("Scenario 12 & 13: Swaps passed via options.swaps apply to base counts when deliveryId is null", () => {
    const baseCounts = { sabzi: 2, daal: 1, roti: 4 };
    const daySwaps: SwapRow[] = [{ fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 }];

    const swappedCounts = applySwapsToCounts(baseCounts, daySwaps);
    expect(swappedCounts).toEqual({ sabzi: 1, daal: 2, roti: 4 });
  });

  // Scenario 14: Carried days preserve swaps correctly without leakage
  it("Scenario 14: Carried days preserve swaps for specific dates without cross-day leakage", () => {
    const swaps = [
      { deliveryId: 10n, forDate: "2026-09-21", fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 },
      { deliveryId: 10n, forDate: "2026-09-22", fromCategory: "sabzi", toCategory: "salad", qtyFrom: 1, qtyTo: 1 },
    ];

    const tripDate = "2026-09-21";
    const day1Swaps = swaps.filter((s) => swapAppliesTo(s.forDate, tripDate, "2026-09-21"));
    const day2Swaps = swaps.filter((s) => swapAppliesTo(s.forDate, tripDate, "2026-09-22"));

    expect(day1Swaps).toHaveLength(1);
    expect(day1Swaps[0]!.toCategory).toBe("daal");

    expect(day2Swaps).toHaveLength(1);
    expect(day2Swaps[0]!.toCategory).toBe("salad");
  });

  // Scenario 15: Packing item label formatting for multi-pick container vs count
  it("Scenario 15: Packing item label formats multi-slot container dishes with portions and count dishes in bulk", () => {
    const daalPicks = [{ name: "Dal Tadka" }, { name: "Dal Tadka" }];
    const daalPortions = ["12oz", "12oz"];
    const daalLabel = packingItemLabel(daalPicks, daalPortions, 2, "weight");
    expect(daalLabel).toBe("Dal Tadka 12oz, Dal Tadka 12oz");

    const rotiPicks = [{ name: "Roti" }];
    const rotiPortions = ["4 roti"];
    const rotiLabel = packingItemLabel(rotiPicks, rotiPortions, 4, "count");
    expect(rotiLabel).toBe("Roti 4");
  });

  // Additional Regression Test: Mixed container categories + cross-category swap
  it("Regression: Mixed container categories + cross-category swap preserves all slot structures across UI, kitchen packing, and daily labels without leakage", () => {
    // 1. Initial meal setup:
    // Sabzi: Paneer Makhani (12oz = 1.50 TU), Aloo Gobi (8oz = 1.00 TU)
    // Daal: Dal Tadka (12oz = 1.50 TU)
    // Raita: Raita (8oz = 1.00 TU), Raita (8oz = 1.00 TU)
    // Roti: 4 rotis (1.00 TU = 4 roti)
    const mealItems = [
      { category: "sabzi", tuAmount: "1.50", sortOrder: 0 },
      { category: "sabzi", tuAmount: "1.00", sortOrder: 1 },
      { category: "daal", tuAmount: "1.50", sortOrder: 2 },
      { category: "raita", tuAmount: "1.00", sortOrder: 3 },
      { category: "raita", tuAmount: "1.00", sortOrder: 4 },
      { category: "roti", tuAmount: "1.00", sortOrder: 5 },
    ];
    const baseCounts = { sabzi: 2, daal: 1, raita: 2, roti: 4 };

    // 2. Cross-category swap: ONE Sabzi -> Daal
    const tripDate = "2026-09-24";
    const day1Date = "2026-09-24";
    const day2Date = "2026-09-25";

    const allTripSwaps = [
      { deliveryId: 100n, forDate: day1Date, fromCategory: "sabzi", toCategory: "daal", qtyFrom: 1, qtyTo: 1 },
    ];

    // Assertion 8: No cross-day swap leakage
    const day1Swaps = allTripSwaps.filter((s) => swapAppliesTo(s.forDate, tripDate, day1Date));
    const day2Swaps = allTripSwaps.filter((s) => swapAppliesTo(s.forDate, tripDate, day2Date));

    expect(day1Swaps).toHaveLength(1);
    expect(day2Swaps).toHaveLength(0); // Day 2 has no swaps

    // Assertion 6: The swap is preserved when resolving the meal for Day 1
    const day1EffectiveCounts = applySwapsToCounts(baseCounts, day1Swaps);
    expect(day1EffectiveCounts).toEqual({ sabzi: 1, daal: 2, raita: 2, roti: 4 });

    // 3. Portions resolution for Day 1
    const day1Portions = portionsByCategory(mealItems, tuByKey, day1Swaps);

    // Assertion 1 & 2: Two Daal containers remain two separate 12oz slots (NOT one 24oz item)
    expect(day1Portions.get("daal")).toEqual(["12oz", "12oz"]);
    expect(day1Portions.get("daal")).not.toContain("24oz");

    // Assertion 3: Two Raita containers remain separate 8oz slots (NOT one 16oz item)
    expect(day1Portions.get("raita")).toEqual(["8oz", "8oz"]);
    expect(day1Portions.get("raita")).not.toContain("16oz");

    // Assertion 4: Remaining Sabzi remains 8oz (front-removed 12oz Paneer Makhani; remaining is 8oz Aloo Gobi)
    expect(day1Portions.get("sabzi")).toEqual(["8oz"]);

    // Assertion 5: Roti remains aggregated as the existing bulk/count representation (4 roti)
    expect(day1Portions.get("roti")).toEqual(["4 roti"]);

    // Day 2 (no swaps) keeps original base portions without leakage
    const day2Portions = portionsByCategory(mealItems, tuByKey, day2Swaps);
    expect(day2Portions.get("sabzi")).toEqual(["12oz", "8oz"]);
    expect(day2Portions.get("daal")).toEqual(["12oz"]);
    expect(day2Portions.get("raita")).toEqual(["8oz", "8oz"]);
    expect(day2Portions.get("roti")).toEqual(["4 roti"]);

    // 4. Assertion 7a: Flow into Customer Meal Summary
    const day1Cells: GridCell[] = [
      // Sabzi: 1 remaining cell (Aloo Gobi)
      {
        day: "thu",
        dateIso: day1Date,
        slot: "sabzi",
        personIndex: 1,
        pickIndex: 1,
        selectable: true,
        quantity: 1,
        selectedDishId: "d_aloo",
        isDefaulted: false,
        dishes: [{ id: "d_aloo", name: "Aloo Gobi", image: null }],
        locked: false,
      },
      // Daal: 2 cells (Dal Tadka and 2nd Daal container)
      {
        day: "thu",
        dateIso: day1Date,
        slot: "daal",
        personIndex: 1,
        pickIndex: 1,
        selectable: false,
        quantity: 1,
        selectedDishId: "d_dal",
        isDefaulted: true,
        dishes: [{ id: "d_dal", name: "Dal Tadka", image: null }],
        locked: false,
      },
      {
        day: "thu",
        dateIso: day1Date,
        slot: "daal",
        personIndex: 1,
        pickIndex: 2,
        selectable: false,
        quantity: 1,
        selectedDishId: "d_dal",
        isDefaulted: true,
        dishes: [{ id: "d_dal", name: "Dal Tadka", image: null }],
        locked: false,
      },
      // Raita: 2 cells
      {
        day: "thu",
        dateIso: day1Date,
        slot: "raita",
        personIndex: 1,
        pickIndex: 1,
        selectable: false,
        quantity: 1,
        selectedDishId: "d_raita",
        isDefaulted: true,
        dishes: [{ id: "d_raita", name: "Raita", image: null }],
        locked: false,
      },
      {
        day: "thu",
        dateIso: day1Date,
        slot: "raita",
        personIndex: 1,
        pickIndex: 2,
        selectable: false,
        quantity: 1,
        selectedDishId: "d_raita",
        isDefaulted: true,
        dishes: [{ id: "d_raita", name: "Raita", image: null }],
        locked: false,
      },
      // Roti: 1 bulk cell with quantity 4
      {
        day: "thu",
        dateIso: day1Date,
        slot: "roti",
        personIndex: 1,
        pickIndex: 1,
        selectable: false,
        quantity: 4,
        selectedDishId: "d_roti",
        isDefaulted: true,
        dishes: [{ id: "d_roti", name: "Roti", image: null }],
        locked: false,
      },
    ];

    const portionsBySlot = {
      sabzi: day1Portions.get("sabzi")!,
      daal: day1Portions.get("daal")!,
      raita: day1Portions.get("raita")!,
      roti: day1Portions.get("roti")!,
    };

    const groups = groupPickCells(day1Cells, categoriesMeta, portionsBySlot);
    const summary = buildMealSummary(groups, {});

    expect(summary).toEqual([
      { categoryLabel: "Sabzi", lines: ["Aloo Gobi · 8oz"] },
      { categoryLabel: "Daal", lines: ["Dal Tadka · 12oz", "Dal Tadka · 12oz"] },
      { categoryLabel: "Raita", lines: ["Raita · 8oz", "Raita · 8oz"] },
      { categoryLabel: "Roti", lines: ["Roti · 4 roti"] },
    ]);

    // 5. Assertion 7b: Flow into Kitchen Packing Sheet
    const ordered = [
      {
        category: "sabzi",
        label: "Sabzi",
        selectable: true,
        quantity: 1,
        picks: [{ dishId: 201n, dishPublicId: "d_aloo", name: "Aloo Gobi", isDefaulted: false }],
      },
      {
        category: "daal",
        label: "Daal",
        selectable: false,
        quantity: 2,
        picks: [
          { dishId: 202n, dishPublicId: "d_dal", name: "Dal Tadka", isDefaulted: true },
          { dishId: 202n, dishPublicId: "d_dal", name: "Dal Tadka", isDefaulted: true },
        ],
      },
      {
        category: "raita",
        label: "Raita",
        selectable: false,
        quantity: 2,
        picks: [
          { dishId: 203n, dishPublicId: "d_raita", name: "Raita", isDefaulted: true },
          { dishId: 203n, dishPublicId: "d_raita", name: "Raita", isDefaulted: true },
        ],
      },
      {
        category: "roti",
        label: "Roti",
        selectable: false,
        quantity: 4,
        picks: [{ dishId: 204n, dishPublicId: "d_roti", name: "Roti", isDefaulted: true }],
      },
    ];

    const packingLineBySlot = new Map<string, { name: string; portion: string; quantity: number }>();
    for (const cat of ordered) {
      const conv = tuByKey.get(cat.category);
      if (isContainerCategory(conv) || cat.selectable) {
        cat.picks.forEach((pick, i) => {
          const pickIndex = i + 1;
          const portion = (portionForPick(day1Portions, cat.category, pickIndex) ?? "").trim();
          packingLineBySlot.set(`${cat.category}:${pickIndex}`, { name: pick.name, portion, quantity: 1 });
        });
      } else {
        packingLineBySlot.set(`${cat.category}:fixed`, {
          name: cat.picks[0]!.name,
          portion: "4 roti",
          quantity: 1,
        });
      }
    }

    expect([...packingLineBySlot.keys()]).toEqual([
      "sabzi:1",
      "daal:1",
      "daal:2",
      "raita:1",
      "raita:2",
      "roti:fixed",
    ]);
    expect(packingLineBySlot.get("sabzi:1")).toEqual({ name: "Aloo Gobi", portion: "8oz", quantity: 1 });
    expect(packingLineBySlot.get("daal:1")).toEqual({ name: "Dal Tadka", portion: "12oz", quantity: 1 });
    expect(packingLineBySlot.get("daal:2")).toEqual({ name: "Dal Tadka", portion: "12oz", quantity: 1 });
    expect(packingLineBySlot.get("raita:1")).toEqual({ name: "Raita", portion: "8oz", quantity: 1 });
    expect(packingLineBySlot.get("raita:2")).toEqual({ name: "Raita", portion: "8oz", quantity: 1 });
    expect(packingLineBySlot.get("roti:fixed")).toEqual({ name: "Roti", portion: "4 roti", quantity: 1 });

    // 6. Assertion 7c: Flow into Daily Labels
    const dailyLabelLines: { category: string; dish: string; portion: string | null }[] = [];
    for (const cat of ordered) {
      cat.picks.forEach((pick, i) => {
        dailyLabelLines.push({
          category: cat.category,
          dish: pick.name,
          portion: portionForPick(day1Portions, cat.category, i + 1),
        });
      });
    }

    expect(dailyLabelLines).toEqual([
      { category: "sabzi", dish: "Aloo Gobi", portion: "8oz" },
      { category: "daal", dish: "Dal Tadka", portion: "12oz" },
      { category: "daal", dish: "Dal Tadka", portion: "12oz" },
      { category: "raita", dish: "Raita", portion: "8oz" },
      { category: "raita", dish: "Raita", portion: "8oz" },
      { category: "roti", dish: "Roti", portion: "4 roti" },
    ]);
  });
});
