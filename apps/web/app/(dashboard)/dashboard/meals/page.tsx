import { redirect } from "next/navigation";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { cutoffMsFor } from "@tiffin/commons";
import { UtensilsCrossedIcon } from "lucide-react";
import { db } from "@/db/client";
import { deliveryFrequencies, dishes, mealSlots, menuWeeks, orders, plans, users } from "@/db/schema";
import { auth } from "@/lib/auth";
import { orderDeliveryDays, visibleSlots } from "@/lib/menu/delivery-days";
import { comingWeekStartIso, subscriptionDeliveryDates, type DeliveryDate } from "@/lib/menu/delivery-dates";
import { selectionsService } from "@/lib/menu/selections.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { menuService } from "@/lib/services/menu.service";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@/components/ds";
import { MealsGrid } from "./meals-grid";

export type GridCell = {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  dateIso: string;
  slot: string;
  personIndex: number;
  selectedDishId: string | null;
  dishes: { id: string; name: string; diet: "veg" | "nonveg" }[];
  locked: boolean;
};

export default async function MealsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [userRow] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);

  if (!userRow) redirect("/login");

  const [orderRow] = await db
    .select({
      id: orders.id,
      publicId: orders.publicId,
      userId: orders.userId,
      planId: orders.planId,
      persons: orders.persons,
      mealSlots: orders.mealSlots,
      includeSaturday: orders.includeSaturday,
      includeSunday: orders.includeSunday,
      startDate: orders.startDate,
      durationWeeks: orders.durationWeeks,
      status: orders.status,
      frequencyKey: deliveryFrequencies.key,
    })
    .from(orders)
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .where(eq(orders.userId, userRow.id))
    .orderBy(desc(orders.createdAt))
    .limit(1);

  const activeOrder = orderRow?.status === "active" ? orderRow : null;

  if (!activeOrder) {
    return (
      <PageShell>
        <PageHeader icon={UtensilsCrossedIcon} title="My Meals" />
        <EmptyState
          icon={UtensilsCrossedIcon}
          message="You don't have an active subscription yet."
          action={<a href="/subscribe" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Subscribe now</a>}
        />
      </PageShell>
    );
  }

  const { timezone, cutoffHour } = await getAppSettings();
  const comingMonday = comingWeekStartIso(Date.now(), timezone);

  const [releasedWeek] = await db
    .select()
    .from(menuWeeks)
    .where(and(eq(menuWeeks.status, "released"), eq(menuWeeks.weekStart, comingMonday)))
    .limit(1);

  if (!releasedWeek) {
    return (
      <PageShell>
        <PageHeader icon={UtensilsCrossedIcon} title="My Meals" />
        <EmptyState
          icon={UtensilsCrossedIcon}
          message="The menu for the coming week hasn't been published yet. Check back soon."
        />
      </PageShell>
    );
  }

  const deliveryDays = orderDeliveryDays({
    frequencyKey: activeOrder.frequencyKey,
    includeSaturday: activeOrder.includeSaturday,
    includeSunday: activeOrder.includeSunday,
  });
  const subDates: DeliveryDate[] = subscriptionDeliveryDates({
    startDate: activeOrder.startDate,
    durationWeeks: activeOrder.durationWeeks,
    deliveryDays,
  });
  const weekDates = subDates.filter((d) => d.weekStartIso === releasedWeek.weekStart);

  if (weekDates.length === 0) {
    return (
      <PageShell>
        <PageHeader icon={UtensilsCrossedIcon} title="My Meals" />
        <EmptyState
          icon={UtensilsCrossedIcon}
          message="No deliveries are scheduled for the coming week on your subscription."
        />
      </PageShell>
    );
  }

  const [planRow] = await db
    .select({ key: plans.key })
    .from(plans)
    .where(eq(plans.id, activeOrder.planId))
    .limit(1);

  const planKey = planRow?.key ?? "mixed";
  const allowedDiets: ("veg" | "nonveg")[] =
    planKey === "veg" ? ["veg"] : planKey === "halal_nonveg" ? ["nonveg"] : ["veg", "nonveg"];

  const { items: allItems } = await menuService.weekWithItems(releasedWeek.publicId);

  const allDishBigintIds = [...new Set(allItems.map((i) => i.dishId))];
  const [allSlotsRows, picks, dishRows] = await Promise.all([
    db
      .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
      .from(mealSlots)
      .orderBy(asc(mealSlots.sortOrder)),
    selectionsService.effectiveSelections(activeOrder.id, releasedWeek.id),
    allDishBigintIds.length > 0
      ? db
          .select({ id: dishes.publicId, bigintId: dishes.id, name: dishes.name, diet: dishes.diet })
          .from(dishes)
          .where(inArray(dishes.id, allDishBigintIds))
          .orderBy(asc(dishes.name))
      : Promise.resolve([]),
  ]);

  const dishMap = new Map(dishRows.map((d) => [d.bigintId, { id: d.id, name: d.name, diet: d.diet }]));
  const dishPublicIdByBigintId = new Map(dishRows.map((d) => [d.bigintId, d.id]));
  const purchasedSlotKeys = new Set(activeOrder.mealSlots);
  const orderSlotsRows = allSlotsRows.filter((s) => purchasedSlotKeys.has(s.key));

  // Compute each delivery day's cutoff once, server-side — the single source of
  // truth shared by the grid rows and the cells (no client recompute).
  const weekDatesView = weekDates.map((d) => {
    const lockMs = cutoffMsFor(d.dateIso, cutoffHour, timezone);
    return { ...d, lockMs, locked: Date.now() > lockMs };
  });

  const grid: GridCell[] = [];

  for (const { dateIso, dayOfWeek: day, locked } of weekDatesView) {
    const dayItems = allItems.filter((i) => i.dayOfWeek === day);
    const slots = visibleSlots(activeOrder.mealSlots, activeOrder.mealSlots, dayItems);

    for (const slot of slots) {
      const slotItems = dayItems.filter((i) => i.slot === slot);
      const slotDishes = slotItems
        .map((i) => dishMap.get(i.dishId))
        .filter((d): d is { id: string; name: string; diet: "veg" | "nonveg" } => !!d && allowedDiets.includes(d.diet));

      if (slotDishes.length === 0) continue;

      for (let p = 1; p <= activeOrder.persons; p++) {
        const pick = picks.find(
          (sel) => sel.dayOfWeek === day && sel.slot === slot && sel.personIndex === p
        );

        let selectedDishId: string | null = null;
        if (pick) {
          selectedDishId = dishPublicIdByBigintId.get(pick.dishId) ?? null;
        } else {
          const defaultItem = slotItems.find((i) => i.isDefault);
          selectedDishId = defaultItem ? (dishPublicIdByBigintId.get(defaultItem.dishId) ?? null) : null;
        }

        grid.push({
          day,
          dateIso,
          slot,
          personIndex: p,
          selectedDishId,
          dishes: slotDishes,
          locked,
        });
      }
    }
  }

  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title="My Meals" />
      <SectionCard title={`Coming week — meals for ${releasedWeek.weekStart}`}>
        <MealsGrid
          orderId={activeOrder.publicId}
          menuWeekId={releasedWeek.publicId}
          grid={grid}
          persons={activeOrder.persons}
          weekDates={weekDatesView}
          enabledSlots={orderSlotsRows}
          timezone={timezone}
        />
      </SectionCard>
    </PageShell>
  );
}
