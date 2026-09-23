// Derived directly from invitation/member rows' own timestamps — NOT a new audit_log
// join (audit_log has no organizationId column; adding one is explicitly out of scope
// per this plan's Global Constraints). "Recent activity" here means: invitations sent
// in the last 30 days, and members added in the last 30 days, merged and sorted by
// timestamp. This is a smaller feature than a true audit feed by design (YAGNI) — if a
// richer feed is wanted later, that's a follow-up plan that adds the audit_log join
// properly, not something to smuggle into this one.
import { CalendarIcon, MailIcon, UserPlusIcon } from "lucide-react";

export type ActivityItem =
  | { kind: "invited"; email: string; at: string }
  | { kind: "joined"; name: string | null; email: string | null; at: string };

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return <p className="text-muted-foreground text-sm">No recent activity.</p>;
  }
  return (
    <ul className="space-y-3">
      {items.map((item, i) => (
        <li key={i} className="flex items-center gap-3 text-sm">
          {item.kind === "invited" ? (
            <>
              <MailIcon className="size-4 text-muted-foreground" />
              <span>Invited <span className="font-medium">{item.email}</span></span>
            </>
          ) : (
            <>
              <UserPlusIcon className="size-4 text-muted-foreground" />
              <span><span className="font-medium">{item.name ?? item.email}</span> joined</span>
            </>
          )}
          <span className="text-muted-foreground ml-auto flex items-center gap-1 text-xs">
            <CalendarIcon className="size-3" />
            {new Date(item.at).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}
