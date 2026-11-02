import { ChartCard } from "@/components/analytics/chart-card";
import { TickBar } from "@/components/analytics/tick-bar";
import { Badge } from "@/components/reui/badge";
import { getOptimoRouteStatus } from "@/lib/services/optimoroute/config";
import { nextRoutePushStatus } from "@/lib/services/optimoroute/push-status";
import { getDriverLanes } from "@/lib/services/overview.service";
import { PushDayButton } from "./push-day-button";
import { FooterLink } from "./footer-link";

const TICKS = 50;
const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${iso}T12:00:00Z`));

/** Next delivery day and how much of it is on OptimoRoute. Hidden when OptimoRoute is not installed. */
export async function RouteCard({ today }: { today: string }) {
  const optimo = await getOptimoRouteStatus();
  if (!optimo.installed) return null;
  const status = await nextRoutePushStatus(today);
  const drivers = status ? (await getDriverLanes(status.date)).length : 0;
  const pct = status && status.total > 0 ? Math.round((status.pushed / status.total) * 100) : 0;

  return (
    <ChartCard title="Tomorrow's route" subtitle={status ? `${dayLabel(status.date)}, stops sent to OptimoRoute` : "Stops sent to OptimoRoute"}>
      {status == null ? (
        <p className="text-muted-foreground text-sm">No delivery day ahead.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="text-2xl font-medium tracking-tight tabular-nums">
              {status.pushed} of {status.total}
            </span>
            <span className="text-muted-foreground text-sm">stops pushed</span>
            <Badge variant={status.pushed >= status.total ? "success-light" : "warning-light"}>{pct}%</Badge>
          </div>
          <TickBar filled={Math.round((pct / 100) * TICKS)} ticks={TICKS} tone={status.pushed >= status.total ? "success" : "warning"} />
          <p className="text-muted-foreground text-sm">
            {drivers === 0 ? "No drivers assigned yet" : `${drivers} driver${drivers === 1 ? "" : "s"} assigned`}
          </p>
          {status.pushed < status.total && optimo.hasApiKey ? (
            <div>
              <PushDayButton date={status.date} dayLabel={dayLabel(status.date)} stops={status.total} />
            </div>
          ) : null}
        </div>
      )}
      <FooterLink href="/dashboard/dispatch">View Dispatch</FooterLink>
    </ChartCard>
  );
}
