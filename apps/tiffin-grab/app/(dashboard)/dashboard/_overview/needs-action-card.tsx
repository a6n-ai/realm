import Link from "next/link";
import { CheckIcon, CircleAlertIcon, CreditCardIcon, LifeBuoyIcon, RefreshCwIcon, RouteIcon, type LucideIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { ChartCard } from "@/components/analytics/chart-card";
import { Badge } from "@/components/reui/badge";
import { getOptimoRouteStatus } from "@/lib/services/optimoroute/config";
import { nextRoutePushStatus } from "@/lib/services/optimoroute/push-status";
import { getTodayCounts, listReviewPayments } from "@/lib/services/today.service";
import { PushDayButton } from "./push-day-button";
import { VerifyPaymentButton } from "./verify-payment-button";

type Line = { key: string; icon: LucideIcon; count: number | null; label: string; sub: string; action: React.ReactNode };

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${iso}T12:00:00Z`));

const go = (href: string, text: string) => (
  <Button asChild size="sm" variant="outline">
    <Link href={href}>{text}</Link>
  </Button>
);

export async function NeedsActionCard({ visible, today, seesAll }: { visible: "all" | string[]; today: string; seesAll: boolean }) {
  const [c, [oldest]] = await Promise.all([getTodayCounts(visible, today), listReviewPayments(visible, 1)]);
  // Quick action: verify the oldest payment in place (same rule as the queue's Verify); the rest via the pill filter.
  const canVerifyOldest = oldest != null && oldest.method !== "stripe" && (oldest.status === "pending_verification" || oldest.status === "awaiting_payment");
  const lines: Line[] = [
    {
      key: "payment", icon: CreditCardIcon, count: c.byKind.payment, label: "payments to verify",
      sub: oldest ? `oldest: ${oldest.customer}` : "oldest first",
      action: (
        <div className="flex items-center gap-2">
          {canVerifyOldest ? (
            <VerifyPaymentButton
              who={oldest.customer}
              label="Verify oldest"
              payment={{ orderId: oldest.orderId, paymentId: oldest.paymentId, amount: oldest.amount, method: oldest.method, reference: oldest.reference, proofUrl: oldest.proofUrl, status: oldest.status }}
            />
          ) : null}
          {go("/dashboard?type=payment#queue", "All")}
        </div>
      ),
    },
  ];
  if (seesAll) {
    const optimo = await getOptimoRouteStatus();
    const push = optimo.installed ? await nextRoutePushStatus(today).catch(() => null) : null;
    if (push) {
      const left = push.total - push.pushed;
      lines.push({
        key: "route",
        icon: RouteIcon,
        count: left,
        label: `stop${left === 1 ? "" : "s"} not pushed`,
        sub: `route ${dayLabel(push.date)}`,
        action: left > 0 && optimo.hasApiKey ? <PushDayButton date={push.date} dayLabel={dayLabel(push.date)} stops={push.total} /> : go("/dashboard/dispatch", "Dispatch"),
      });
    }
  }
  lines.push(
    { key: "missed", icon: CircleAlertIcon, count: c.byKind.missed, label: "missed days", sub: "past days nobody confirmed", action: go("/dashboard?type=missed#queue", "Review") },
    { key: "renewal", icon: RefreshCwIcon, count: c.byKind.renewal, label: "plans ending within 2 days", sub: "not renewed yet", action: go("/dashboard/renewals?ending=2", "Renew") },
    { key: "ticket", icon: LifeBuoyIcon, count: c.byKind.ticket, label: "tickets waiting", sub: c.overdueTickets ? `${c.overdueTickets} overdue` : "open and in progress", action: go("/dashboard/tickets", "Tickets") },
  );
  const open = lines.filter((l) => (l.count ?? 0) > 0).length;
  return (
    <ChartCard title="Needs action" subtitle={open === 0 ? "Nothing is waiting" : `${open} of ${lines.length} areas have work, worst first`}>
      <ul className="flex flex-col divide-y">
        {lines.map((l) => {
          const clear = l.count === 0;
          return (
            <li key={l.key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <l.icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{l.count == null ? `? ${l.label}` : `${l.count} ${l.label}`}</div>
                <div className="text-muted-foreground truncate text-xs">{l.count == null ? "count unavailable" : l.sub}</div>
              </div>
              {clear ? (
                <Badge variant="success-light">
                  <CheckIcon aria-hidden />
                  clear
                </Badge>
              ) : (
                l.action
              )}
            </li>
          );
        })}
      </ul>
    </ChartCard>
  );
}
