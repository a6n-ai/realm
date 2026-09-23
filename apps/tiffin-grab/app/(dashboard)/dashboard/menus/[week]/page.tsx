import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { parseIsoDateUtc } from "@foundry/commons";
import { ArrowLeft, CalendarIcon } from "lucide-react";
import { db } from "@/db/client";
import { dishes, mealSizeItems, mealSizes, plans } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { menuService } from "@/lib/services/menu.service";
import { getMealTypes } from "@/lib/services/app-settings.service";
import { dishCategoriesService } from "@/lib/services/dish-categories.service";
import { maxQtyBySlot } from "@/lib/menu/category-hint";
import { formatDateOnly } from "@/lib/format/datetime";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuBuilder, MenuBuilderSkeleton } from "../menu-builder";
import type { Slot } from "../menu-grid";

type Params = Promise<{ week: string }>;

function weekRange(weekStart: string): string {
  const end = parseIsoDateUtc(weekStart);
  end.setUTCDate(end.getUTCDate() + 6);
  return `${formatDateOnly(weekStart, { mode: "short" })} – ${formatDateOnly(end.toISOString().slice(0, 10), { mode: "short" })}`;
}

export default function MenuWeekPage({ params }: { params: Params }) {
  return (
    <PageShell>
      <PageHeader
        icon={CalendarIcon}
        title="Weekly Menu"
        actions={
          <Link
            href="/dashboard/menus"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="size-4" />
            All menus
          </Link>
        }
      />
      <Suspense fallback={<SectionCard title="Menu"><MenuBuilderSkeleton /></SectionCard>}>
        <WeekData params={params} />
      </Suspense>
    </PageShell>
  );
}

async function WeekData({ params }: { params: Params }) {
  await requireAdmin();
  const { week: weekPublicId } = await params;

  const result = await menuService.weekWithItems(weekPublicId);
  // A menu id that names nothing is a 404, not an empty builder — the old
  // ?week=<bogus> silently fell back to "create a new week", which read as data loss.
  if (!result.week) notFound();

  const [mealTypes, activeDishes, weeks, categories, planRows, sizeItemRows, problems] = await Promise.all([
    getMealTypes(),
    db.select({ id: dishes.publicId, name: dishes.name, category: dishes.category, planId: plans.publicId })
      .from(dishes).innerJoin(plans, eq(plans.id, dishes.planId))
      .where(eq(dishes.active, true)).orderBy(asc(dishes.name)),
    menuService.listWeekMenus(),
    dishCategoriesService.enabledCategories(),
    db.select({ id: plans.id, publicId: plans.publicId, name: plans.name })
      .from(plans).where(eq(plans.active, true)),
    // "N needed" hint + slot list source: every (category, plan) pair any active meal
    // size's composition actually asks for. Keyed by the ITEM's own planId, not its
    // parent meal size's — an item can independently target a different plan.
    db.select({ mealSizeId: mealSizeItems.mealSizeId, category: mealSizeItems.category, planId: mealSizeItems.planId })
      .from(mealSizeItems)
      .innerJoin(mealSizes, eq(mealSizeItems.mealSizeId, mealSizes.id))
      .where(eq(mealSizes.active, true)),
    result.week.status === "released" ? Promise.resolve([]) : menuService.releaseProblems(weekPublicId),
  ]);

  const dishRows = await db.select({ bigintId: dishes.id, publicId: dishes.publicId }).from(dishes);
  const byId = new Map(dishRows.map((d) => [d.bigintId, d.publicId]));
  const items = result.items.flatMap((i) => {
    const dishId = byId.get(i.dishId);
    return dishId
      ? [{ id: i.publicId, dayOfWeek: i.dayOfWeek, slot: i.slot, dishId, position: i.position, isDefault: i.isDefault }]
      : [];
  });

  const week = {
    id: result.week.publicId,
    weekStart: result.week.weekStart,
    status: result.week.status,
    updatedAt: result.week.updatedAt,
  };

  const planPublicById = new Map(planRows.map((p) => [p.id, p.publicId]));
  const categoryByKey = new Map(categories.map((c) => [c.key, c]));
  const planByPublicId = new Map(planRows.map((p) => [p.publicId, p]));

  // One slot per (category, plan) pair actually present in an active meal size's
  // composition — the same source releaseProblems checks, so the grid asks for exactly
  // what a release would flag as missing.
  const slotMap = new Map<string, Slot>();
  for (const row of sizeItemRows) {
    const planPublicId = planPublicById.get(row.planId);
    const category = categoryByKey.get(row.category);
    const plan = planPublicId ? planByPublicId.get(planPublicId) : undefined;
    if (!planPublicId || !category || !plan) continue;
    const key = `${row.category}|${planPublicId}`;
    if (!slotMap.has(key)) {
      slotMap.set(key, {
        key,
        categoryKey: category.key,
        categoryLabel: category.label,
        selectable: category.selectable,
        sortOrder: category.sortOrder,
        planPublicId,
        planName: plan.name,
      });
    }
  }
  const slots = [...slotMap.values()].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.planName.localeCompare(b.planName),
  );

  return (
    <SectionCard title={weekRange(week.weekStart)}>
      {activeDishes.length === 0 && (
        <p className="mb-3 text-sm text-muted-foreground">
          No active dishes yet — add dishes in the Catalog before building a menu.
        </p>
      )}
      <MenuBuilder
        mealType={mealTypes.tiffin}
        slots={slots}
        plans={planRows.map((p) => ({ publicId: p.publicId, name: p.name }))}
        categoryCounts={maxQtyBySlot(sizeItemRows, planPublicById)}
        dishes={activeDishes}
        week={week}
        items={items}
        copySources={weeks
          .filter((w) => w.publicId !== week.id && w.itemCount > 0)
          .map((w) => ({ id: w.publicId, weekStart: w.weekStart }))}
        problems={problems}
      />
    </SectionCard>
  );
}
