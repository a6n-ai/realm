import { getRouteLine } from "@/lib/optimoroute/today-status";
import { RouteStatusLine } from "./route-status-line";

export async function RouteStatus() {
  const line = await getRouteLine();
  return line ? <RouteStatusLine line={line} /> : null;
}
