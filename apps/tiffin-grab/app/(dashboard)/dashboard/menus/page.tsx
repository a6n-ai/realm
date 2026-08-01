import { Suspense } from "react";
import { asc, eq } from "drizzle-orm";
import { zonedDateIso } from "@realm/commons";
import { CalendarIcon } from "lucide-react";
import { db } from "@/db/client";
import { dishes, mealSizeItems, mealSizes } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { getAppSettings, getMealTypes } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { maxQtyByCategory } from "@/lib/menu/category-hint";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuBuilder, MenuBuilderSkeleton } from "./menu-builder";
import { MenuHistoryCard, MenuHistoryCardSkeleton } from "./menu-history-card";

type SearchParams = Promise<{ week?: string }>;

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
  const { week: weekId } = await searchParams;

  const [mealTypes, appSettings, activeDishes, weeks, categories, sizeItemRows] = await Promise.all([
    getMealTypes(),
    getAppSettings(),
    db.select({ id: dishes.publicId, name: dishes.name, category: dishes.category }).from(dishes).where(eq(dishes.active, true)).orderBy(asc(dishes.name)),
    menuService.listWeekMenus(),
    dishCategoriesService.enabledCategories(),
    // One week serves every plan, so the "N needed" hint is the largest quantity any
    // active meal size asks for in a category, across all plans.
    db
      .select({ category: mealSizeItems.category, qty: mealSizeItems.qty })
      .from(mealSizeItems)
      .innerJoin(mealSizes, eq(mealSizeItems.mealSizeId, mealSizes.id))
      .where(eq(mealSizes.active, true)),
  ]);
  const mealType = mealTypes.tiffin;
  // "N needed" hint: the largest quantity any active meal size asks for in a category —
  // the admin should build enough variety to cover the biggest size.
  const categoryCounts = maxQtyByCategory(sizeItemRows);

  let week: { id: string; weekStart: string; status: string; updatedAt: number } | null = null;
  let items: { id: string; dayOfWeek: string; slot: string; dishId: string; position: number; isDefault: boolean }[] = [];
  // Which plans this week would leave without a meal. Computed here rather than on demand so
  // the admin sees it while building, not only when Release refuses.
  let problems: { day: string; planName: string; categoryKey: string; categoryLabel: string }[] = [];
  if (weekId) {
    const result = await menuService.weekWithItems(weekId);
    if (result.week) {
      week = { id: result.week.publicId, weekStart: result.week.weekStart, status: result.week.status, updatedAt: result.week.updatedAt };
      const dishRows = await db.select({ bigintId: dishes.id, publicId: dishes.publicId }).from(dishes);
      const byId = new Map(dishRows.map((d) => [d.bigintId, d.publicId]));
      items = result.items.flatMap((i) => {
        const dishId = byId.get(i.dishId);
        return dishId ? [{ id: i.publicId, dayOfWeek: i.dayOfWeek, slot: i.slot, dishId, position: i.position, isDefault: i.isDefault }] : [];
      });
      if (result.week.status !== "released") problems = await menuService.releaseProblems(weekId);
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
          mealType={mealType}
          categories={categories}
          categoryCounts={categoryCounts}
          dishes={activeDishes}
          week={week}
          items={items}
          takenWeekStarts={weeks.map((w) => w.weekStart)}
          copySources={weeks
            .filter((w) => w.publicId !== week?.id && w.itemCount > 0)
            .map((w) => ({ id: w.publicId, weekStart: w.weekStart }))}
          problems={problems}
        />
      </SectionCard>

      <SectionCard title="Past menus">
        {weeks.length === 0 ? (
          <p className="text-sm text-muted-foreground">No menus yet.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {weeks.map((w) => (
              <MenuHistoryCard
                key={w.publicId}
                week={w}
                accent={mealTypes.tiffin.accent}
                highlight={w.publicId === currentId ? "current" : w.publicId === upcomingId ? "upcoming" : null}
              />
            ))}
          </div>
        )}
      </SectionCard>
    </>
  );
}
