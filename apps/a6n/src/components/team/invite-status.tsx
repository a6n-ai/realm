import { Badge } from "@foundry/ui/badge";
import type { InviteStatus } from "../../lib/mail/mailer";

type Shown = InviteStatus;

const TONE: Record<Shown, "neutral" | "info" | "warning" | "success" | "danger"> = {
  queued: "neutral",
  sent: "info",
  delivered: "success",
  bounced: "danger",
  failed: "danger",
  suppressed: "warning",
  unknown: "neutral",
};

const HINT: Partial<Record<Shown, string>> = {
  suppressed: "Address opted out or bounced before",
  unknown: "Relay has no status for this invite yet",
};

// A member with no invite shows a dash; a key Relay did not return shows "unknown", never an error.
export function InviteStatusBadge({ hasInvite, status }: { hasInvite: boolean; status: InviteStatus | undefined }) {
  if (!hasInvite) return <span className="text-muted-foreground">-</span>;
  const shown: Shown = status ?? "unknown";
  return (
    <Badge variant={TONE[shown] ?? "neutral"} title={HINT[shown]}>
      {shown}
    </Badge>
  );
}
