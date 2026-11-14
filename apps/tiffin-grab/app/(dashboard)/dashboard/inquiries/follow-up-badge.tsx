import { Badge } from "@/components/reui/badge";
import { formatEpoch } from "@/lib/format/datetime";
import type { PipelineRow } from "@/lib/inquiries/inquiries.service";

/** Minutes, hours, then days: the card's relative times read the same at a glance. */
export function ago(ms: number, now: number): string {
  const mins = Math.max(0, Math.round((now - ms) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function FollowUpBadge({ lead, dayStart, dayEnd, now, timeZone }: { lead: PipelineRow; timeZone: string; now: number; dayStart: number; dayEnd: number }) {
  const at = lead.nextFollowUpAt;
  if (at == null) return <Badge variant="warning-light">No follow-up set</Badge>;
  if (at < dayStart) return <Badge variant="destructive-light">Overdue · {ago(at, now)}</Badge>;
  if (at < dayEnd) return <Badge variant="warning-light">Due {formatEpoch(at, { mode: "time", timeZone })}</Badge>;
  return <Badge variant="secondary">{formatEpoch(at, { mode: "datetime", timeZone })}</Badge>;
}
