import { getNextPushLine, getRouteLine } from "@/lib/optimoroute/today-status";
import { RouteStatusLine } from "./route-status-line";

export async function RouteStatus() {
  const [today, next] = await Promise.all([getRouteLine(), getNextPushLine()]);
  if (!today && !next) return null;
  return (
    <>
      {today ? <RouteStatusLine line={today} /> : null}
      {next ? <RouteStatusLine line={next} /> : null}
    </>
  );
}
