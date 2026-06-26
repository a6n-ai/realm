import { asc, eq } from "drizzle-orm";
import { CalendarIcon } from "lucide-react";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { getMealTypes } from "@/lib/services/app-settings.service";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuBuilder } from "./menu-builder";
import { MenuHistoryCard } from "./menu-history-card";
import type { PlanType } from "@/lib/menu/meal-types";

export default async function MenusPage({ searchParams }: { searchParams: Promise<{ type?: string; week?: string }> }) {
  await requireAdmin();
  const { type, week: weekId } = await searchParams;
  const planType: PlanType = type === "healthy" ? "healthy" : "tiffin";

  const [mealTypes, activeDishes, weeks] = await Promise.all([
    getMealTypes(),
    db.select({ id: dishes.publicId, name: dishes.name, diet: dishes.diet }).from(dishes).where(eq(dishes.active, true)).orderBy(asc(dishes.name)),
    menuService.listWeekMenus(planType),
  ]);

  let week: { id: string; weekStart: string; status: string; orderCutoff: string } | null = null;
  let items: { id: string; dayOfWeek: string; slot: string; dishId: string; position: number }[] = [];
  if (weekId) {
    const result = await menuService.weekWithItems(weekId);
    if (result.week) {
      week = { id: result.week.publicId, weekStart: result.week.weekStart, status: result.week.status, orderCutoff: new Date(result.week.orderCutoff).toISOString() };
      const dishRows = await db.select({ bigintId: dishes.id, publicId: dishes.publicId }).from(dishes);
      const byId = new Map(dishRows.map((d) => [d.bigintId, d.publicId]));
      items = result.items.flatMap((i) => {
        const dishId = byId.get(i.dishId);
        return dishId ? [{ id: i.publicId, dayOfWeek: i.dayOfWeek, slot: i.slot, dishId, position: i.position }] : [];
      });
    }
  }

  return (
    <PageShell>
      <PageHeader icon={CalendarIcon} title="Weekly Menus" />
      <SectionCard title="Menu builder">
        {activeDishes.length === 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            No active dishes yet — add dishes in the Dishes section before building a menu.
          </p>
        )}
        <MenuBuilder planType={planType} mealType={mealTypes[planType]} dishes={activeDishes} week={week} items={items} />
      </SectionCard>

      <SectionCard title="Past menus">
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {planType} menus yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {weeks.map((w) => (
              <MenuHistoryCard key={w.publicId} week={w} planType={planType} accent={mealTypes[planType].accent} />
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
