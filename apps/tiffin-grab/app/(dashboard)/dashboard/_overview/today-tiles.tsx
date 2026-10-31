import { AnalyticsStatCards, type AnalyticsStatCardItem } from "@/components/dashboard/stat-cards";
import { getTodayCounts } from "@/lib/services/today.service";
import { listDayDeliveryStatuses } from "@/lib/services/daily-labels.service";
import { nextRoutePushStatus } from "@/lib/services/optimoroute/push-status";
import { getOptimoRouteStatus } from "@/lib/services/optimoroute/config";
import { isScheduledStop } from "./delivery-groups";

const n = (v: number | null) => (v == null ? "—" : String(v));

async function safe<T>(p: Promise<T>): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    console.error("[today] tile source failed", e);
    return null;
  }
}

export async function TodayTiles({ visible, today }: { visible: "all" | string[]; today: string }) {
  const c = await getTodayCounts(visible, today);

  const verify: AnalyticsStatCardItem = {
    label: "To verify",
    value: n(c.toVerify),
    hint: "orders with a payment waiting",
    badge: "Payments",
    badgeTone: (c.toVerify ?? 0) > 0 ? "warn" : "neutral",
    tone: (c.toVerify ?? 0) > 0 ? "warn" : undefined,
    href: "/dashboard/orders?view=payment",
  };
  const tickets: AnalyticsStatCardItem = {
    label: "Unanswered tickets",
    value: n(c.openTickets),
    hint: c.overdueTickets == null ? "open and in progress" : `open and in progress, ${c.overdueTickets} overdue`,
    badge: "Tickets",
    badgeTone: (c.overdueTickets ?? 0) > 0 ? "warn" : "neutral",
    tone: (c.overdueTickets ?? 0) > 0 ? "warn" : undefined,
    href: "/dashboard/tickets",
  };

  let rest: AnalyticsStatCardItem[];
  if (visible === "all") {
    const [status, push, deliveries] = await Promise.all([
      safe(getOptimoRouteStatus()),
      safe(nextRoutePushStatus(today)),
      safe(listDayDeliveryStatuses(today)),
    ]);
    const installed = status?.installed === true;
    const behind = push != null && installed && push.pushed < push.total;
    rest = [
      {
        label: "Route push",
        value: push && installed ? `${push.pushed} / ${push.total}` : "—",
        hint: push && installed ? `stops pushed for ${push.date}` : installed ? "no delivery day ahead" : "OptimoRoute not installed",
        badge: "OptimoRoute",
        badgeTone: behind ? "warn" : "neutral",
        tone: behind ? "warn" : undefined,
        href: "/dashboard/dispatch",
      },
      {
        label: "Deliveries today",
        value: deliveries ? String(deliveries.filter(isScheduledStop).length) : "—",
        hint: "scheduled stops today",
        badge: "Today",
        href: "/dashboard/dispatch",
      },
    ];
  } else {
    rest = [
      {
        label: "Missed days",
        value: n(c.missed),
        hint: "past days nobody confirmed",
        badge: "Deliveries",
        badgeTone: (c.missed ?? 0) > 0 ? "warn" : "neutral",
        tone: (c.missed ?? 0) > 0 ? "warn" : undefined,
        href: "/dashboard/orders?view=missed",
      },
      {
        label: "Ending plans",
        value: n(c.endingPlans),
        hint: "ending within 2 days, not renewed",
        badge: "Renewals",
        href: "/dashboard/renewals?ending=2",
      },
    ];
  }
  return <AnalyticsStatCards items={[verify, tickets, ...rest]} />;
}
