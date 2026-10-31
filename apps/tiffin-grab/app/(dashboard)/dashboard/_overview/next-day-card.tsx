import { ChartCard } from "@/components/analytics/chart-card";
import { Badge } from "@/components/reui/badge";
import { getOptimoRouteStatus } from "@/lib/services/optimoroute/config";
import { nextRoutePushStatus } from "@/lib/services/optimoroute/push-status";
import { PushDayButton } from "./push-day-button";

const dayLabel = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" }).format(Date.parse(`${iso}T12:00:00Z`));

/** Next delivery day and how much of it is on OptimoRoute. Hidden when OptimoRoute is not installed. */
export async function NextDayCard({ today }: { today: string }) {
  const optimo = await getOptimoRouteStatus();
  if (!optimo.installed) return null;
  const status = await nextRoutePushStatus(today);

  return (
    <ChartCard title="Next delivery day" subtitle="Stops sent to OptimoRoute" fill>
      {status == null ? (
        <p className="text-muted-foreground text-sm">No delivery day ahead.</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-2xl font-medium tracking-tight">{dayLabel(status.date)}</span>
            {status.pushed >= status.total ? (
              <Badge variant="success-light">pushed</Badge>
            ) : (
              <Badge variant="warning-light">{status.pushed === 0 ? "not pushed" : `pushed ${status.pushed} of ${status.total}`}</Badge>
            )}
          </div>
          <p className="text-muted-foreground text-sm tabular-nums">
            {status.pushed} of {status.total} stop{status.total === 1 ? "" : "s"} pushed
          </p>
          {status.pushed < status.total && optimo.hasApiKey ? (
            <div>
              <PushDayButton date={status.date} dayLabel={dayLabel(status.date)} stops={status.total} />
            </div>
          ) : null}
        </div>
      )}
    </ChartCard>
  );
}
