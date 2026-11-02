import { ChartCard } from "@/components/analytics/chart-card";
import { ProgressBar } from "@/components/analytics/progress-bar";
import { getDriverLanes } from "@/lib/services/overview.service";
import { FooterLink } from "./footer-link";

export async function LanesCard({ today }: { today: string }) {
  const lanes = await getDriverLanes(today);
  const pulled = lanes.some((l) => l.done > 0);
  return (
    <ChartCard
      title="Driver lanes today"
      subtitle={pulled ? "Stops completed of planned, per driver" : "Planned stops per driver"}
      info={pulled ? undefined : "Completions come from the OptimoRoute pull. None has been recorded yet, so only the plan is shown."}
    >
      {lanes.length === 0 ? (
        <p className="text-muted-foreground text-sm">No routes pulled for today.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {lanes.map((l) => {
            const pct = pulled ? Math.round((l.done / l.stops) * 100) : 0;
            return (
              <li key={l.driver} className="flex flex-col gap-1.5">
                <div className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate font-medium">{l.driver}</span>
                  <span className="text-muted-foreground shrink-0 tabular-nums">
                    {pulled ? `${l.done}/${l.stops} stops · ${pct}%` : `${l.stops} stops`}
                  </span>
                </div>
                <ProgressBar pct={pct} tone="success" />
              </li>
            );
          })}
        </ul>
      )}
      <FooterLink href="/dashboard/dispatch">View Dispatch</FooterLink>
    </ChartCard>
  );
}
