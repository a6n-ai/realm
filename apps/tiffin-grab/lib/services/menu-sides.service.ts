// Side dishes on the menu: which side roles the meals use, their standing source category
// (menu_side_defaults), and one menu day's override (menu_day_sides). The resolver reads
// the same two tables through lib/menu/side-rules.ts.
import { and, eq, ne } from "drizzle-orm";
import { ValidationError } from "@foundry/commons";
import { db } from "@/db/client";
import { dishCategories, dishes, mealSizeItems, mealSizes, menuDaySides, menuSideDefaults, menuWeeks } from "@/db/schema";
import { currentUserId } from "@/lib/services/session-service";
import type { DayOfWeek } from "@/lib/menu/delivery-dates";
import type { MealItemRole } from "@/lib/menu/side-rules";

export type SideRole = Exclude<MealItemRole, "main">;

export type SideSlot = {
  category: string;
  categoryLabel: string;
  role: SideRole;
  /** "5 Item Thali — Large (8oz)", one per active standard meal that has this side. */
  meals: string[];
  /** Standing source category key, or null when none is set (the side repeats the main). */
  defaultSource: string | null;
};

export type DaySide = {
  day: DayOfWeek;
  category: string;
  role: SideRole;
  source: { kind: "category"; key: string } | { kind: "dish"; dishPublicId: string };
};

export type DaySideValue = null | { kind: "category"; key: string } | { kind: "dish"; dishPublicId: string };

const ROLE_LABEL: Record<SideRole, string> = { side_1: "Side 1", side_2: "Side 2" };
export const sideRoleLabel = (role: SideRole) => ROLE_LABEL[role];

async function categoryId(key: string): Promise<bigint> {
  const [row] = await db.select({ id: dishCategories.id }).from(dishCategories).where(eq(dishCategories.key, key)).limit(1);
  if (!row) throw new ValidationError(`Unknown category: ${key}`);
  return row.id;
}

async function weekId(publicId: string): Promise<bigint> {
  const [row] = await db.select({ id: menuWeeks.id }).from(menuWeeks).where(eq(menuWeeks.publicId, publicId)).limit(1);
  if (!row) throw new ValidationError("Week not found");
  return row.id;
}

const isSideRole = (role: string): role is SideRole => role === "side_1" || role === "side_2";

export const menuSidesService = {
  /** Every side role an active standard meal uses, with its meals and standing source. */
  async sideSlots(): Promise<SideSlot[]> {
    const [rows, defaults] = await Promise.all([
      db.select({ category: mealSizeItems.category, role: mealSizeItems.role, label: dishCategories.label, meal: mealSizes.name, tu: mealSizeItems.tuAmount, unitSize: dishCategories.tuUnitSize, unitLabel: dishCategories.tuUnitLabel })
        .from(mealSizeItems)
        .innerJoin(mealSizes, eq(mealSizes.id, mealSizeItems.mealSizeId))
        .innerJoin(dishCategories, eq(dishCategories.key, mealSizeItems.category))
        .where(and(eq(mealSizes.active, true), eq(mealSizes.custom, false), ne(mealSizeItems.role, "main"))),
      db.select({ categoryId: menuSideDefaults.categoryId, role: menuSideDefaults.role, source: dishCategories.key })
        .from(menuSideDefaults)
        .innerJoin(dishCategories, eq(dishCategories.id, menuSideDefaults.sourceCategoryId)),
    ]);
    const catIds = new Map(
      (await db.select({ id: dishCategories.id, key: dishCategories.key }).from(dishCategories)).map((c) => [c.id, c.key]),
    );
    const defaultFor = new Map(defaults.map((d) => [`${catIds.get(d.categoryId)}:${d.role}`, d.source]));
    const slots = new Map<string, SideSlot>();
    for (const r of rows) {
      if (!isSideRole(r.role)) continue;
      const key = `${r.category}:${r.role}`;
      const slot = slots.get(key) ?? { category: r.category, categoryLabel: r.label, role: r.role, meals: [], defaultSource: defaultFor.get(key) ?? null };
      const oz = Math.round(Number(r.tu) * Number(r.unitSize));
      const meal = `${r.meal} (${oz}${r.unitLabel})`;
      if (!slot.meals.includes(meal)) slot.meals.push(meal);
      slots.set(key, slot);
    }
    return [...slots.values()].sort((a, b) => a.category.localeCompare(b.category) || a.role.localeCompare(b.role));
  },

  async daySides(weekPublicId: string): Promise<DaySide[]> {
    const id = await weekId(weekPublicId);
    const rows = await db.select({
      day: menuDaySides.dayOfWeek, role: menuDaySides.role, categoryId: menuDaySides.categoryId,
      sourceCategoryId: menuDaySides.sourceCategoryId, dishPublicId: dishes.publicId,
    })
      .from(menuDaySides)
      .leftJoin(dishes, eq(dishes.id, menuDaySides.dishId))
      .where(eq(menuDaySides.menuWeekId, id));
    const keys = new Map((await db.select({ id: dishCategories.id, key: dishCategories.key }).from(dishCategories)).map((c) => [c.id, c.key]));
    return rows.flatMap((r) => {
      if (!isSideRole(r.role)) return [];
      const category = keys.get(r.categoryId);
      if (!category) return [];
      const source = r.sourceCategoryId != null
        ? { kind: "category" as const, key: keys.get(r.sourceCategoryId)! }
        : { kind: "dish" as const, dishPublicId: r.dishPublicId! };
      return [{ day: r.day as DayOfWeek, category, role: r.role, source }];
    });
  },

  /** The standing source for a side role; null removes it (the side repeats the main). */
  async setDefault(input: { category: string; role: SideRole; source: string | null }): Promise<void> {
    const actor = await currentUserId();
    const cat = await categoryId(input.category);
    if (input.source == null) {
      await db.delete(menuSideDefaults).where(and(eq(menuSideDefaults.categoryId, cat), eq(menuSideDefaults.role, input.role)));
      return;
    }
    const source = await categoryId(input.source);
    await db.insert(menuSideDefaults)
      .values({ categoryId: cat, role: input.role, sourceCategoryId: source, createdBy: actor, updatedBy: actor })
      .onConflictDoUpdate({
        target: [menuSideDefaults.categoryId, menuSideDefaults.role],
        set: { sourceCategoryId: source, updatedBy: actor, updatedAt: Date.now() },
      });
  },

  /** One day's side: another category, one dish, or null to follow the standing default. */
  async setDay(input: { weekId: string; day: DayOfWeek; category: string; role: SideRole; value: DaySideValue }): Promise<void> {
    const actor = await currentUserId();
    const [week, cat] = await Promise.all([weekId(input.weekId), categoryId(input.category)]);
    const where = and(
      eq(menuDaySides.menuWeekId, week), eq(menuDaySides.dayOfWeek, input.day),
      eq(menuDaySides.categoryId, cat), eq(menuDaySides.role, input.role),
    );
    if (input.value == null) {
      await db.delete(menuDaySides).where(where);
      return;
    }
    let sourceCategoryId: bigint | null = null;
    let dishId: bigint | null = null;
    if (input.value.kind === "category") {
      sourceCategoryId = await categoryId(input.value.key);
    } else {
      const [d] = await db.select({ id: dishes.id }).from(dishes).where(eq(dishes.publicId, input.value.dishPublicId)).limit(1);
      if (!d) throw new ValidationError("Dish not found");
      dishId = d.id;
    }
    await db.insert(menuDaySides)
      .values({ menuWeekId: week, dayOfWeek: input.day, categoryId: cat, role: input.role, sourceCategoryId, dishId, createdBy: actor, updatedBy: actor })
      .onConflictDoUpdate({
        target: [menuDaySides.menuWeekId, menuDaySides.dayOfWeek, menuDaySides.categoryId, menuDaySides.role],
        set: { sourceCategoryId, dishId, updatedBy: actor, updatedAt: Date.now() },
      });
  },
};
