import { Badge } from "@foundry/ui/badge";
import { LocalTime } from "../local-time";

export function FollowUpBadge({ at, overdue }: { at: number | null; overdue: boolean }) {
  if (at === null) return <span className="text-muted-foreground">None</span>;
  return (
    <span className="inline-flex items-center gap-2">
      <LocalTime at={at} />
      {overdue ? <Badge variant="danger">Overdue</Badge> : null}
    </span>
  );
}
