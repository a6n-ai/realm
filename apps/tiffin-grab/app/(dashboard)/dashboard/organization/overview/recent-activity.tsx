// Derived directly from invitation/member rows' own timestamps — NOT a new audit_log
// join (audit_log has no organizationId column; adding one is explicitly out of scope
// per this plan's Global Constraints). "Recent activity" here means: invitations sent
// in the last 30 days, and members added in the last 30 days, merged and sorted by
// timestamp. This is a smaller feature than a true audit feed by design (YAGNI) — if a
// richer feed is wanted later, that's a follow-up plan that adds the audit_log join
// properly, not something to smuggle into this one.
import Link from "next/link";
import { ActivityIcon, MailIcon, UserPlusIcon } from "lucide-react";
import { Button } from "@foundry/ui/button";
import { Skeleton } from "@foundry/ui/skeleton";
import { AppDate } from "@/components/dashboard/app-date";
import { EmptyState } from "@/components/ds";

export type ActivityItem =
  | { kind: "invited"; email: string; at: string }
  | { kind: "joined"; name: string | null; email: string | null; at: string };

export function RecentActivity({ items }: { items: ActivityItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ActivityIcon}
        message="No invites or new members yet."
        action={
          <Button asChild size="sm" variant="outline">
            <Link href="/dashboard/organization/members">Invite staff</Link>
          </Button>
        }
      />
    );
  }
  return (
    <ul className="divide-y">
      {items.map((item, i) => {
        const Icon = item.kind === "invited" ? MailIcon : UserPlusIcon;
        return (
          <li key={i} className="flex items-center gap-3 py-2.5 text-sm first:pt-0 last:pb-0">
            <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full">
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1 truncate">
              {item.kind === "invited" ? (
                <>
                  Invited <span className="font-medium">{item.email}</span>
                </>
              ) : (
                <>
                  <span className="font-medium">{item.name ?? item.email}</span> joined
                </>
              )}
            </span>
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              <AppDate value={item.at} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function RecentActivitySkeleton() {
  return (
    <div className="flex flex-col gap-3">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="size-8 rounded-full" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-3 w-20" />
        </div>
      ))}
    </div>
  );
}
