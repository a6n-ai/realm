import { describe, expect, it } from "vitest";
import { buildCustomerWeek, dietLegend, foldPicks, initialDay, planOf } from "../customer-week";

const week = {
  weekStart: "2026-10-19",
  slots: [{ key: "sabzi", label: "Sabzi" }, { key: "rice", label: "Rice" }],
  items: [
    { dayOfWeek: "mon" as const, slot: "rice", dishName: "Jeera Rice (Veg)", position: 0 },
    { dayOfWeek: "mon" as const, slot: "rice", dishName: "Jeera Rice (Non-Veg)", position: 1 },
    { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Aloo Gobi (Veg)", position: 0 },
    { dayOfWeek: "thu" as const, slot: "sabzi", dishName: "Mix Veg", position: 0 },
  ],
};
const NOW = Date.parse("2026-10-22T14:00:00Z");
const TODAY = "2026-10-22";

describe("buildCustomerWeek", () => {
  it("lists seven days with dishes in slot order, diet suffix dropped and deduped", () => {
    const days = buildCustomerWeek(week, [], TODAY, NOW);
    expect(days.map((d) => d.date)).toEqual(["2026-10-19", "2026-10-20", "2026-10-21", "2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25"]);
    expect(days[0]!.groups).toEqual([{ key: "sabzi", label: "Sabzi", dishes: [{ name: "Aloo Gobi", nonVeg: false }] }, { key: "rice", label: "Rice", dishes: [{ name: "Jeera Rice", nonVeg: false }] }]);
    expect(days[1]!.groups).toEqual([]);
  });

  it("tags each day with what this customer has", () => {
    const rows = [
      { deliveryDate: "2026-10-20", status: "scheduled", cutoffAt: 0 },
      { deliveryDate: "2026-10-22", status: "scheduled", cutoffAt: NOW - 1 },
      { deliveryDate: "2026-10-23", status: "scheduled", cutoffAt: NOW + 1 },
      { deliveryDate: "2026-10-24", status: "paused", cutoffAt: NOW + 1 },
      { deliveryDate: "2026-10-25", status: "skipped", cutoffAt: NOW + 1 },
    ];
    const days = buildCustomerWeek(week, rows, TODAY, NOW);
    expect(days.map((d) => d.mine)).toEqual([null, "delivered", null, "locked", "pick", "paused", "hold"]);
    expect(days[4]!.cutoffAt).toBe(NOW + 1);
    expect(days[3]!.cutoffAt).toBeNull();
  });

  it("shows the full menu by default and only the customer's plan when filtered", () => {
    const both = {
      ...week,
      items: [
        { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Aloo Gobi", position: 0, planName: "Pure Vegetarian Plan" },
        { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Aloo Gobi (Non-Veg)", position: 0, planName: "Non-Veg Plan" },
        { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Chicken Curry", position: 1, planName: "Non-Veg Plan" },
      ],
    };
    const row = (planName: string) => ({ deliveryDate: "2026-10-19", status: "scheduled", cutoffAt: 0, planName });
    expect(planOf([row("Non-Veg Plan"), row("Non-Veg Plan")])).toBe("Non-Veg Plan");
    expect(planOf([row("Pure Vegetarian Plan"), row("Non-Veg Plan")])).toBeNull();
    expect(planOf([])).toBeNull();
    const names = (plan?: string) => buildCustomerWeek(both, [], TODAY, NOW, plan)[0]!.groups[0]!.dishes.map((d) => d.name);
    expect(names()).toEqual(["Aloo Gobi", "Chicken Curry"]);
    expect(names("Pure Vegetarian Plan")).toEqual(["Aloo Gobi"]);
    expect(names("Non-Veg Plan")).toEqual(["Aloo Gobi", "Chicken Curry"]);
    // Only on the non-veg plan, so marked; Aloo Gobi is on both plans, so not.
    expect(buildCustomerWeek(both, [], TODAY, NOW)[0]!.groups[0]!.dishes).toEqual([{ name: "Aloo Gobi", nonVeg: false }, { name: "Chicken Curry", nonVeg: true }]);
  });
});

describe("initialDay", () => {
  it("opens on today, else the next pickable day, else the first day with dishes", () => {
    const days = buildCustomerWeek(week, [{ deliveryDate: "2026-10-23", status: "scheduled", cutoffAt: NOW + 1 }], TODAY, NOW);
    expect(initialDay(days, TODAY)).toBe(TODAY);
    expect(initialDay(days, "2026-10-01")).toBe("2026-10-23");
    expect(initialDay(buildCustomerWeek(week, [], TODAY, NOW), "2026-10-01")).toBe("2026-10-19");
  });
});

describe("plan colours", () => {
  const veg = { planName: "Pure Vegetarian Plan", planLabel: "Veg", planColor: "#16a34a" };
  const nv = { planName: "Non-Veg Plan", planLabel: "Non-veg", planColor: "#dc2626" };
  const items = [
    { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Aloo Gobi", position: 0, ...nv },
    { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Aloo Gobi", position: 0, ...veg },
    { dayOfWeek: "mon" as const, slot: "sabzi", dishName: "Chicken Curry", position: 1, ...nv },
  ];

  it("colours a dish by the plan on its side, so a shared veg dish stays veg", () => {
    const dishes = buildCustomerWeek({ ...week, items }, [], TODAY, NOW)[0]!.groups[0]!.dishes;
    expect(dishes).toEqual([{ name: "Aloo Gobi", nonVeg: false, color: "#16a34a" }, { name: "Chicken Curry", nonVeg: true, color: "#dc2626" }]);
  });

  it("lists each tagged diet once, veg first", () => {
    expect(dietLegend(items)).toEqual([{ label: "Veg", color: "#16a34a" }, { label: "Non-veg", color: "#dc2626" }]);
    expect(dietLegend(week.items)).toEqual([]);
  });
});

describe("popular dishes", () => {
  const sabzi = (...names: string[]) => ({ ...week, items: names.map((dishName, position) => ({ dayOfWeek: "mon" as const, slot: "sabzi", dishName, position })) });
  const popular = (w: ReturnType<typeof sabzi>, picks: Record<string, number>) =>
    buildCustomerWeek(w, [], TODAY, NOW, null, picks)[0]!.groups[0]!.dishes.filter((d) => d.popular).map((d) => d.name);

  it("marks the clear favourite among a category's options", () => {
    expect(popular(sabzi("Aloo Gobi", "Palak Paneer"), { "Palak Paneer": 12, "Aloo Gobi": 4 })).toEqual(["Palak Paneer"]);
  });

  it("marks nothing without a choice, too few picks, or a tie", () => {
    expect(popular(sabzi("Aloo Gobi"), { "Aloo Gobi": 40 })).toEqual([]);
    expect(popular(sabzi("Aloo Gobi", "Palak Paneer"), { "Palak Paneer": 4 })).toEqual([]);
    expect(popular(sabzi("Aloo Gobi", "Palak Paneer"), { "Palak Paneer": 9, "Aloo Gobi": 9 })).toEqual([]);
  });

  it("folds per-plan dish names onto the name the menu shows", () => {
    expect(foldPicks({ "Dal Tadka (Veg)": 3, "Dal Tadka (Non-Veg)": 4, Kadhi: 2 })).toEqual({ "Dal Tadka": 7, Kadhi: 2 });
  });
});
