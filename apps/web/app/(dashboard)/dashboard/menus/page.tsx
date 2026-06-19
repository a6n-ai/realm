import { asc, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { dishes, mealSlots } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { MenuBuilder } from "./menu-builder";

export default async function MenusPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireAdmin();

  const { week: weekId } = await searchParams;

  const [enabledSlots, activeDishesList] = await Promise.all([
    db
      .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
      .from(mealSlots)
      .where(eq(mealSlots.enabled, true))
      .orderBy(asc(mealSlots.sortOrder)),
    db
      .select({ id: dishes.id, name: dishes.name, diet: dishes.diet, slots: dishes.slots })
      .from(dishes)
      .where(eq(dishes.active, true))
      .orderBy(asc(dishes.name)),
  ]);

  let week: { id: string; weekStart: string; status: string; orderCutoff: string } | null = null;
  let items: {
    id: string;
    dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
    slot: string;
    dishId: string;
    isDefault: boolean;
  }[] = [];

  if (weekId) {
    const result = await menuService.weekWithItems(weekId);
    if (result.week) {
      week = {
        id: result.week.id,
        weekStart: result.week.weekStart,
        status: result.week.status,
        orderCutoff: result.week.orderCutoff.toISOString(),
      };
      items = result.items.map((i) => ({
        id: i.id,
        dayOfWeek: i.dayOfWeek,
        slot: i.slot,
        dishId: i.dishId,
        isDefault: i.isDefault,
      }));
    }
  }

  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold">Weekly Menu Builder</h1>
      <MenuBuilder
        slots={enabledSlots}
        dishes={activeDishesList}
        week={week}
        items={items}
      />
    </section>
  );
}
