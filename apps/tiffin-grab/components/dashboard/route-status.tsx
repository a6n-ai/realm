import { RouteIcon, TruckIcon } from "lucide-react";
import { getNextPushLine, getRouteLine } from "@/lib/optimoroute/today-status";
import { RouteStatusLine } from "./route-status-line";

export async function RouteStatus() {
  const [today, next] = await Promise.all([getRouteLine(), getNextPushLine()]);
  if (!today && !next) return null;
  return (
    <div className="border-border grid min-w-0 gap-1.5 border-t pt-2">
      <span className="text-muted-foreground text-caption-2 font-medium tracking-wide uppercase">OptimoRoute</span>
      {today ? <RouteStatusLine line={today} icon={TruckIcon} label="Today's run" /> : null}
      {next ? <RouteStatusLine line={next} icon={RouteIcon} label="Next delivery day" /> : null}
    </div>
  );
}
