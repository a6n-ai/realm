import { asc, eq } from "drizzle-orm";
import { zonedDateIso } from "@tiffin/commons";
import { CalendarIcon } from "lucide-react";
import { db } from "@/db/client";
import { dishes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { getAppSettings, getMealTypes } from "@/lib/services/app-settings.service";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuBuilder } from "./menu-builder";
import { MenuHistoryCard } from "./menu-history-card";
import type { PlanType } from "@/lib/menu/meal-types";

export default async function MenusPage({ searchParams }: { searchParams: Promise<{ type?: string; week?: string }> }) {
  await requireAdmin();
  const { type, week: weekId } = await searchParams;
  const planType: PlanType = type === "healthy" ? "healthy" : "tiffin";

  const [mealTypes, appSettings, activeDishes, weeks] = await Promise.all([
    getMealTypes(),
    getAppSettings(),
    db.select({ id: dishes.publicId, name: dishes.name, diet: dishes.diet }).from(dishes).where(eq(dishes.active, true)).orderBy(asc(dishes.name)),
    menuService.listWeekMenus(planType),
  ]);

  let week: { id: string; weekStart: string; status: string } | null = null;
  let items: { id: string; dayOfWeek: string; slot: string; dishId: string; position: number }[] = [];
  if (weekId) {
    const result = await menuService.weekWithItems(weekId);
    if (result.week) {
      week = { id: result.week.publicId, weekStart: result.week.weekStart, status: result.week.status };
      const dishRows = await db.select({ bigintId: dishes.id, publicId: dishes.publicId }).from(dishes);
      const byId = new Map(dishRows.map((d) => [d.bigintId, d.publicId]));
      items = result.items.flatMap((i) => {
        const dishId = byId.get(i.dishId);
        return dishId ? [{ id: i.publicId, dayOfWeek: i.dayOfWeek, slot: i.slot, dishId, position: i.position }] : [];
      });
    }
  }

  const today = zonedDateIso(Date.now(), appSettings.timezone);
  const addDaysIso = (iso: string, n: number) => {
    const d = new Date(`${iso}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return d.toISOString().slice(0, 10);
  };
  const currentId = weeks.find((w) => w.weekStart <= today && today <= addDaysIso(w.weekStart, 6))?.publicId;
  const futureStarts = weeks.filter((w) => w.weekStart > today).map((w) => w.weekStart).sort();
  const upcomingId = futureStarts.length ? weeks.find((w) => w.weekStart === futureStarts[0])?.publicId : undefined;

  return (
    <PageShell>
      <PageHeader icon={CalendarIcon} title="Weekly Menus" />
      <SectionCard title="Menu builder">
        {activeDishes.length === 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            No active dishes yet — add dishes in the Dishes section before building a menu.
          </p>
        )}
        <MenuBuilder planType={planType} mealType={mealTypes[planType]} dishes={activeDishes} week={week} items={items} takenWeekStarts={weeks.map((w) => w.weekStart)} />
      </SectionCard>

      <SectionCard title="Past menus">
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {planType} menus yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {weeks.map((w) => (
              <MenuHistoryCard
                key={w.publicId}
                week={w}
                planType={planType}
                accent={mealTypes[planType].accent}
                highlight={w.publicId === currentId ? "current" : w.publicId === upcomingId ? "upcoming" : null}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
