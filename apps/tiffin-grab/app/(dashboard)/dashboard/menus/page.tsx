import { Suspense } from "react";
import { and, asc, eq } from "drizzle-orm";
import { zonedDateIso } from "@realm/commons";
import { CalendarIcon } from "lucide-react";
import { db } from "@/db/client";
import { dishes, plans } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { getAppSettings, getMealTypes } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuBuilder, MenuBuilderSkeleton } from "./menu-builder";
import { MenuHistoryCard, MenuHistoryCardSkeleton } from "./menu-history-card";
import type { PlanType } from "@/lib/menu/meal-types";

type SearchParams = Promise<{ type?: string; week?: string }>;

export default function MenusPage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <PageShell>
      <PageHeader icon={CalendarIcon} title="Weekly Menus" />
      <Suspense
        fallback={
          <>
            <SectionCard title="Menu builder">
              <MenuBuilderSkeleton />
            </SectionCard>
            <SectionCard title="Past menus">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <MenuHistoryCardSkeleton key={i} />
                ))}
              </div>
            </SectionCard>
          </>
        }
      >
        <MenusData searchParams={searchParams} />
      </Suspense>
    </PageShell>
  );
}

async function MenusData({ searchParams }: { searchParams: SearchParams }) {
  await requireAdmin();
  const { type, week: weekId } = await searchParams;
  const planType: PlanType = type === "healthy" ? "healthy" : "tiffin";

  const [mealTypes, appSettings, activeDishes, weeks, categories, planRows] = await Promise.all([
    getMealTypes(),
    getAppSettings(),
    db.select({ id: dishes.publicId, name: dishes.name, diet: dishes.diet }).from(dishes).where(eq(dishes.active, true)).orderBy(asc(dishes.name)),
    menuService.listWeekMenus(planType),
    dishCategoriesService.forPlanType(planType),
    db.select({ counts: plans.categoryCounts }).from(plans).where(and(eq(plans.planType, planType), eq(plans.active, true))),
  ]);
  const mealType = mealTypes[planType];
  // "N needed" hint: the plan whose category_counts sum to the most food is the
  // one the admin should build enough variety for (biggest plan wins ties).
  const categoryCounts = planRows.reduce<Record<string, number>>((max, r) => {
    const total = Object.values(r.counts).reduce((n, v) => n + v, 0);
    const maxTotal = Object.values(max).reduce((n, v) => n + v, 0);
    return total > maxTotal ? r.counts : max;
  }, {});

  let week: { id: string; weekStart: string; status: string } | null = null;
  let items: { id: string; dayOfWeek: string; slot: string; dishId: string; position: number; isDefault: boolean }[] = [];
  if (weekId) {
    const result = await menuService.weekWithItems(weekId);
    if (result.week) {
      week = { id: result.week.publicId, weekStart: result.week.weekStart, status: result.week.status };
      const dishRows = await db.select({ bigintId: dishes.id, publicId: dishes.publicId }).from(dishes);
      const byId = new Map(dishRows.map((d) => [d.bigintId, d.publicId]));
      items = result.items.flatMap((i) => {
        const dishId = byId.get(i.dishId);
        return dishId ? [{ id: i.publicId, dayOfWeek: i.dayOfWeek, slot: i.slot, dishId, position: i.position, isDefault: i.isDefault }] : [];
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
    <>
      <SectionCard title="Menu builder">
        {activeDishes.length === 0 && (
          <p className="mb-3 text-sm text-muted-foreground">
            No active dishes yet — add dishes in the Dishes section before building a menu.
          </p>
        )}
        <MenuBuilder
          planType={planType}
          mealType={mealType}
          categories={categories}
          categoryCounts={categoryCounts}
          dishes={activeDishes}
          week={week}
          items={items}
          takenWeekStarts={weeks.map((w) => w.weekStart)}
        />
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
    </>
  );
}
