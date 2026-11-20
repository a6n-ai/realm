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

/** The lead row's muted meta line: the follow-up state as text, since the status pill already carries the lead's state. */
export function FollowUpBadge({ lead, dayStart, dayEnd, now, timeZone }: { lead: PipelineRow; timeZone: string; now: number; dayStart: number; dayEnd: number }) {
  const at = lead.nextFollowUpAt;
  const text =
    at == null ? "No follow-up set"
    : at < dayStart ? `Overdue · ${ago(at, now)}`
    : at < dayEnd ? `Due ${formatEpoch(at, { mode: "time", timeZone })}`
    : formatEpoch(at, { mode: "datetime", timeZone });
  return <span className="tabular-nums">{text}</span>;
}
