import { asc, eq } from "drizzle-orm";
import { CalendarIcon } from "lucide-react";
import { db } from "@/db/client";
import { dishes, mealSlots } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuBuilder } from "./menu-builder";

export default async function MenusPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  await requireAdmin();

  const { week: weekId } = await searchParams;

  const [enabledSlots, activeDishesList, allDishesForMap] = await Promise.all([
    db
      .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
      .from(mealSlots)
      .where(eq(mealSlots.enabled, true))
      .orderBy(asc(mealSlots.sortOrder)),
    db
      .select({ id: dishes.publicId, name: dishes.name, diet: dishes.diet, slots: dishes.slots })
      .from(dishes)
      .where(eq(dishes.active, true))
      .orderBy(asc(dishes.name)),
    db
      .select({ bigintId: dishes.id, publicId: dishes.publicId })
      .from(dishes),
  ]);

  const dishPublicIdByBigintId = new Map(allDishesForMap.map((d) => [d.bigintId, d.publicId]));

  let week: { id: string; weekStart: string; status: string; orderCutoff: string } | null = null;
  let items: {
    id: string;
    dayOfWeek: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
    slot: string;
    dishId: string;
    position: number;
  }[] = [];

  if (weekId) {
    const result = await menuService.weekWithItems(weekId);
    if (result.week) {
      week = {
        id: result.week.publicId,
        weekStart: result.week.weekStart,
        status: result.week.status,
        orderCutoff: new Date(result.week.orderCutoff).toISOString(),
      };
      items = result.items.flatMap((i) => {
        const dishId = dishPublicIdByBigintId.get(i.dishId);
        if (!dishId) return [];
        return [{ id: i.publicId, dayOfWeek: i.dayOfWeek, slot: i.slot, dishId, position: i.position }];
      });
    }
  }

  return (
    <PageShell>
      <PageHeader icon={CalendarIcon} title="Weekly Menus" />
      <SectionCard title="Menu builder">
        <MenuBuilder
          slots={enabledSlots}
          dishes={activeDishesList}
          week={week}
          items={items}
        />
      </SectionCard>
    </PageShell>
  );
}
