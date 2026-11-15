import { Suspense } from "react";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, CalendarIcon } from "lucide-react";
import { can, requirePagePermission } from "@/lib/auth/guards";
import { menuService } from "@/lib/menu/menu.service";
import { getMealTypes } from "@/lib/menu/meal-types-settings";
import { dishCategoriesService } from "@/lib/menu/dish-categories.service";
import { maxQtyBySlot } from "@/lib/menu/category-hint";
import { formatDateOnly } from "@/lib/format/datetime";
import { PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MenuBuilder, MenuBuilderSkeleton } from "../menu-builder";
import { MenuReminderButton } from "./menu-reminder-button";
import { menuSidesService } from "@/lib/menu/menu-sides.service";
import type { Slot } from "../menu-grid";
import { addDaysIso } from "@foundry/commons/util/dates";
import { WEEK_DAYS } from "@/lib/deliveries/schedule/delivery-days";

type Params = Promise<{ week: string }>;

function weekRange(weekStart: string): string {
  return `${formatDateOnly(weekStart, { mode: "short" })} – ${formatDateOnly(addDaysIso(weekStart, 6), { mode: "short" })}`;
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
  await requirePagePermission({ menu: ["read"] });
  const canEdit = await can({ menu: ["write"] });
  const { week: weekPublicId } = await params;

  const result = await menuService.weekWithItems(weekPublicId);
  // A menu id that names nothing is a 404, not an empty builder — the old
  // ?week=<bogus> silently fell back to "create a new week", which read as data loss.
  if (!result.week) notFound();

  if (!canEdit) return <ReadOnlyWeek week={result.week} items={result.items} />;

  const [mealTypes, activeDishes, weeks, categories, planRows, sizeItemRows, problems] = await Promise.all([
    getMealTypes(),
    menuService.activeDishes(),
    menuService.listWeekMenus(),
    dishCategoriesService.enabledCategories(),
    menuService.activePlans(),
    menuService.activeSizeItems(),
    result.week.status === "released" ? Promise.resolve([]) : menuService.releaseProblems(weekPublicId),
  ]);

  const byId = await menuService.dishPublicIds();
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

  // Side dishes: the day's dishes (any category) the side can take, by weekday.
  const [sideSlots, daySides] = await Promise.all([menuSidesService.sideSlots(), menuSidesService.daySides(week.id)]);

  return (
    <SectionCard
      title={weekRange(week.weekStart)}
      action={week.status === "released" ? <MenuReminderButton weekId={week.id} /> : undefined}
    >
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
        sides={{ weekId: week.id, slots: sideSlots, categories: categories.map((c) => ({ key: c.key, label: c.label })), daySides }}
      />
    </SectionCard>
  );
}

async function ReadOnlyWeek({ week, items }: { week: NonNullable<Awaited<ReturnType<typeof menuService.weekWithItems>>["week"]>; items: Awaited<ReturnType<typeof menuService.weekWithItems>>["items"] }) {
  const [dishes, byId] = await Promise.all([menuService.activeDishes(), menuService.dishPublicIds()]);
  const nameByPublicId = new Map(dishes.map((d) => [d.id, d.name]));
  return (
    <SectionCard title={weekRange(week.weekStart)} subtitle={`${week.status === "released" ? "Released" : "Not released"} · read only`}>
      <ul className="divide-y rounded-xl border">
        {WEEK_DAYS.map((day) => {
          const names = items
            .filter((i) => i.dayOfWeek === day)
            .flatMap((i) => {
              const id = byId.get(i.dishId);
              return id ? [nameByPublicId.get(id) ?? "Inactive dish"] : [];
            });
          return (
            <li key={day} className="flex gap-4 px-4 py-3 text-sm">
              <span className="w-24 shrink-0 font-medium capitalize">{day}</span>
              <span className="text-muted-foreground">{names.length ? names.join(", ") : "Nothing planned"}</span>
            </li>
          );
        })}
      </ul>
    </SectionCard>
  );
}
