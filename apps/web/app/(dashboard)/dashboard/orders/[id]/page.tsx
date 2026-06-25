import { notFound } from "next/navigation";
import { PackageIcon } from "lucide-react";
import { NotFoundError } from "@tiffin/commons";
import { requireStaff } from "@/lib/auth/guards";
import { readOrder, listOrderActivities } from "@/lib/services/orders.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { buildMealsGrid } from "@/lib/menu/meals-grid";
import { formatEpoch } from "@/lib/format/datetime";
import { PageShell, PageHeader, SectionCard, ListRow, OrderStatusBadge } from "@/components/ds";
import { MealsGrid } from "../../meals/meals-grid";
import { LifecycleControls } from "./lifecycle-controls";

const fmt = (n: number) => new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD" }).format(n);

function describe(a: { type: string; note: string | null; fromStatus: string | null; toStatus: string | null }) {
  switch (a.type) {
    case "created": return "Order created";
    case "activated": return "Activated";
    case "paused": return "Paused";
    case "resumed": return "Resumed";
    case "cancelled": return "Cancelled";
    case "status_change": return `Status: ${a.fromStatus} → ${a.toStatus}`;
    default: return a.note ?? a.type;
  }
}

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireStaff();
  const { id } = await params;

  const settingsP = getAppSettings();
  let order;
  try {
    order = await readOrder(id);
  } catch (e) {
    void settingsP.catch(() => {});
    if (e instanceof NotFoundError) notFound();
    throw e;
  }
  const [activities, settings] = await Promise.all([listOrderActivities(order.id), settingsP]);

  const grid = await buildMealsGrid(
    {
      id: order.id, publicId: order.publicId, planId: order.planId, persons: order.persons,
      mealSlots: order.mealSlots, includeSaturday: order.includeSaturday, includeSunday: order.includeSunday,
      startDate: order.startDate, durationWeeks: order.durationWeeks, frequencyKey: order.frequencyKey,
      pausedFrom: order.pausedFrom, pausedUntil: order.pausedUntil,
    },
    settings,
  );

  return (
    <PageShell>
      <PageHeader icon={PackageIcon} title={order.fullName} />

      <SectionCard title="Summary">
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-3">
            <OrderStatusBadge status={order.status} />
            <span className="text-muted-foreground">{order.deploymentId}</span>
          </div>
          <p><span className="text-muted-foreground">Plan: </span>{order.planName} · {order.mealSizeName} · {order.frequencyKey}</p>
          <p><span className="text-muted-foreground">Schedule: </span>start {order.startDate} · {order.durationWeeks} weeks · {order.persons} person(s) · {order.mealSlots.join(", ")}</p>
          {order.status === "paused" && order.pausedFrom && (
            <p><span className="text-muted-foreground">Paused: </span>{order.pausedFrom} → {order.pausedUntil}</p>
          )}
          <p><span className="text-muted-foreground">Address: </span>{order.addressLine}, {order.city} {order.postalCode}</p>
          <p><span className="text-muted-foreground">Total: </span>{fmt(Number(order.total))} · Payments: {order.payments.map((p) => fmt(Number(p.amount))).join(", ") || "none"}</p>
        </div>
      </SectionCard>

      <SectionCard title="Lifecycle">
        <LifecycleControls orderId={order.publicId} status={order.status} />
      </SectionCard>

      <SectionCard title="Coming week meals">
        {order.status === "cancelled" ? (
          <p className="text-muted-foreground text-sm">This order is cancelled — meal selections are closed.</p>
        ) : grid.empty === "no-week" ? (
          <p className="text-muted-foreground text-sm">The coming week&apos;s menu hasn&apos;t been published yet.</p>
        ) : grid.empty === "no-dates" ? (
          <p className="text-muted-foreground text-sm">No deliveries scheduled for the coming week on this order.</p>
        ) : grid.empty === null ? (
          <MealsGrid
            orderId={order.publicId}
            menuWeekId={grid.releasedWeek.publicId}
            grid={grid.grid}
            persons={grid.persons}
            weekDates={grid.weekDatesView}
            enabledSlots={grid.enabledSlots}
            timezone={settings.timezone}
          />
        ) : null}
      </SectionCard>

      <SectionCard title="Activity">
        {activities.length === 0 ? (
          <p className="text-muted-foreground text-sm">No activity yet.</p>
        ) : (
          <div className="space-y-2">
            {activities.map((a) => (
              <ListRow key={a.publicId} title={describe(a)} meta={formatEpoch(a.createdAt, { mode: "datetime" })} />
            ))}
          </div>
        )}
      </SectionCard>
    </PageShell>
  );
}
