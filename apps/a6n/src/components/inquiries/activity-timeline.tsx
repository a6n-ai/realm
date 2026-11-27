import type { Activity } from "../../lib/inquiries/queries";
import { LocalTime } from "../local-time";
import { describeActivity } from "./labels";

export function ActivityTimeline({ activities }: { activities: Activity[] }) {
  if (activities.length === 0) return <p className="text-muted-foreground">No activity yet.</p>;
  return (
    <ol className="grid gap-4">
      {activities.map((a) => (
        <li key={a.id} className="grid gap-1 border-l-2 pl-3">
          <p className="font-medium text-(--strong)">{describeActivity(a)}</p>
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
