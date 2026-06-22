import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { UtensilsCrossedIcon } from "lucide-react";
import { db } from "@/db/client";
import { deliveryFrequencies, orders, users } from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { EmptyState, PageHeader, PageShell, SectionCard } from "@/components/ds";
import { buildMealsGrid } from "@/lib/menu/meals-grid";
import { MealsGrid } from "./meals-grid";

export type { GridCell } from "@/lib/menu/meals-grid";

export default async function MealsPage() {
  const session = await getSession();
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
      pausedFrom: orders.pausedFrom,
      pausedUntil: orders.pausedUntil,
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
          message="You don't have an active order yet."
          action={<a href="/subscribe" className="inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Subscribe now</a>}
        />
      </PageShell>
    );
  }

  const settings = await getAppSettings();
  const result = await buildMealsGrid(activeOrder, settings);

  if (result.empty !== null) {
    const message =
      result.empty === "no-week"
        ? "The menu for the coming week hasn't been published yet. Check back soon."
        : "No deliveries are scheduled for the coming week on your order.";
    return (
      <PageShell>
        <PageHeader icon={UtensilsCrossedIcon} title="My Meals" />
        <EmptyState icon={UtensilsCrossedIcon} message={message} />
      </PageShell>
    );
  }

  const { releasedWeek, weekDatesView, grid, enabledSlots, persons } = result;

  return (
    <PageShell>
      <PageHeader icon={UtensilsCrossedIcon} title="My Meals" />
      <SectionCard title={`Coming week — meals for ${releasedWeek.weekStart}`}>
        <MealsGrid
          orderId={activeOrder.publicId}
          menuWeekId={releasedWeek.publicId}
          grid={grid}
          persons={persons}
          weekDates={weekDatesView}
          enabledSlots={enabledSlots}
          timezone={settings.timezone}
        />
      </SectionCard>
    </PageShell>
  );
}
