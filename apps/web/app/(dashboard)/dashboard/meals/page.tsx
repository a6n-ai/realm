import { redirect } from "next/navigation";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { UtensilsCrossedIcon } from "lucide-react";
import { db } from "@/db/client";
import { deliveryFrequencies, dishes, mealSlots, menuWeeks, orders, plans } from "@/db/schema";
import { auth } from "@/lib/auth";
import { orderDeliveryDays, visibleSlots } from "@/lib/menu/delivery-days";
import { selectionsService } from "@/lib/menu/selections.service";
import { menuService } from "@/lib/services/menu.service";
import { MealsGrid } from "./meals-grid";

export type GridCell = {
  day: "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";
  slot: string;
  personIndex: number;
  selectedDishId: string | null;
  dishes: { id: string; name: string; diet: "veg" | "nonveg" }[];
};

export default async function MealsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const [orderRow] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      planId: orders.planId,
      persons: orders.persons,
      mealSlots: orders.mealSlots,
      includeSaturday: orders.includeSaturday,
      includeSunday: orders.includeSunday,
      status: orders.status,
      frequencyKey: deliveryFrequencies.key,
    })
    .from(orders)
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .where(eq(orders.userId, session.user.id))
    .orderBy(desc(orders.createdAt))
    .limit(1);

  const activeOrder = orderRow?.status === "active" ? orderRow : null;

  const [releasedWeek] = await db
    .select()
    .from(menuWeeks)
    .where(eq(menuWeeks.status, "released"))
    .orderBy(desc(menuWeeks.weekStart))
    .limit(1);

  if (!activeOrder || !releasedWeek) {
    return (
      <section className="space-y-6">
        <div className="group flex items-center gap-3">
          <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
            <UtensilsCrossedIcon className="icon-pop size-5" />
          </span>
          <h1 className="gradient-text text-2xl font-semibold">My Meals</h1>
        </div>
        {!activeOrder ? (
          <div className="card-glow hover-lift rounded-lg border p-8 text-center space-y-3">
            <p className="text-muted-foreground">You don&#39;t have an active subscription yet.</p>
            <a
              href="/subscribe"
              className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            >
              Subscribe now
            </a>
          </div>
        ) : (
          <div className="card-glow hover-lift rounded-lg border p-8 text-center">
            <p className="text-muted-foreground">No menu has been published for this week. Check back soon.</p>
          </div>
        )}
      </section>
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

  const { items: allItems } = await menuService.weekWithItems(releasedWeek.id);

  const allDishIds = [...new Set(allItems.map((i) => i.dishId))];
  const [allSlotsRows, picks, dishRows] = await Promise.all([
    db
      .select({ key: mealSlots.key, label: mealSlots.label, sortOrder: mealSlots.sortOrder })
      .from(mealSlots)
      .orderBy(asc(mealSlots.sortOrder)),
    selectionsService.effectiveSelections(activeOrder.id, releasedWeek.id),
    allDishIds.length > 0
      ? db
          .select({ id: dishes.id, name: dishes.name, diet: dishes.diet })
          .from(dishes)
          .where(inArray(dishes.id, allDishIds))
          .orderBy(asc(dishes.name))
      : Promise.resolve([]),
  ]);

  const dishMap = new Map(dishRows.map((d) => [d.id, d]));
  const purchasedSlotKeys = new Set(activeOrder.mealSlots);
  const orderSlotsRows = allSlotsRows.filter((s) => purchasedSlotKeys.has(s.key));

  const deliveryDays = orderDeliveryDays({
    frequencyKey: activeOrder.frequencyKey,
    includeSaturday: activeOrder.includeSaturday,
    includeSunday: activeOrder.includeSunday,
  });

  const isLocked = new Date() > new Date(releasedWeek.orderCutoff);

  const grid: GridCell[] = [];

  for (const day of deliveryDays) {
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
          selectedDishId = pick.dishId;
        } else {
          const defaultItem = slotItems.find((i) => i.isDefault);
          selectedDishId = defaultItem?.dishId ?? null;
        }

        grid.push({
          day,
          slot,
          personIndex: p,
          selectedDishId,
          dishes: slotDishes,
        });
      }
    }
  }

  return (
    <section className="space-y-6">
      <div className="group flex items-center gap-3">
        <span className="bg-muted text-muted-foreground flex size-9 items-center justify-center rounded-lg">
          <UtensilsCrossedIcon className="icon-pop size-5" />
        </span>
        <h1 className="gradient-text text-2xl font-semibold">My Meals</h1>
      </div>
      {isLocked && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Selections are locked for this week. The cutoff has passed.
        </div>
      )}
      <MealsGrid
        orderId={activeOrder.id}
        menuWeekId={releasedWeek.id}
        grid={grid}
        isLocked={isLocked}
        persons={activeOrder.persons}
        deliveryDays={deliveryDays}
        enabledSlots={orderSlotsRows}
      />
    </section>
  );
}
