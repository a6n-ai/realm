import type { Activity } from "../../lib/inquiries/queries";
import { LocalTime } from "../local-time";
import { stageLabel } from "./labels";

const TYPE_LABEL: Record<string, string> = { note: "Note", call: "Call", whatsapp: "WhatsApp", email: "Email" };

function describe(a: Activity): string {
  switch (a.type) {
    case "created":
      return "Inquiry created";
    case "stage_change":
      return `Stage changed from ${stageLabel(a.fromStage ?? "")} to ${stageLabel(a.toStage ?? "")}`;
    case "reopened":
      return `Reopened at ${stageLabel(a.toStage ?? "")}`;
    case "reassigned":
      return !a.fromOwnerName && a.toOwnerName === a.actorName
        ? `Claimed by ${a.toOwnerName}`
        : `Assigned to ${a.toOwnerName ?? "nobody"}${a.fromOwnerName ? ` (was ${a.fromOwnerName})` : ""}`;
    default:
      return TYPE_LABEL[a.type] ?? a.type;
  }
}

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) return <p className="text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="grid gap-4">
      {activities.map((a) => (
        <li key={a.id} className="grid gap-1 border-l-2 pl-3">
          <p className="font-medium text-(--strong)">{describe(a)}</p>
          {a.note ? <p className="whitespace-pre-wrap">{a.note}</p> : null}
          <p className="text-xs text-muted-foreground">
            {a.actorName ? `${a.actorName} · ` : ""}
            <LocalTime at={a.createdAt} time />
          </p>
        </li>
      ))}
    </ol>
  );
}
