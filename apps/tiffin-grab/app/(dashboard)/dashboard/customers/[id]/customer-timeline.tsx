import Link from "next/link";
import { ClipboardListIcon, HistoryIcon, PackageIcon } from "lucide-react";
import { EmptyState } from "@/components/ds";
import { formatEpoch } from "@/lib/format/datetime";
import type { getCustomer360 } from "@/lib/services/customers.service";

type TimelineEntry = Awaited<ReturnType<typeof getCustomer360>>["timeline"][number];

const KIND_ICON = { order: PackageIcon, inquiry: ClipboardListIcon } as const;

function entryHref(e: TimelineEntry): string {
  const id = e.id.slice(e.id.indexOf(":") + 1);
  return e.kind === "order" ? `/dashboard/orders/${id}` : `/dashboard/inquiries/${id}`;
}

// Icon-per-kind feed row, consistent with the order-detail Activity log's visual
// language (icon chip + label + timestamp) rather than the plain title/meta ListRow
// this used before — same rail treatment as most activity/timeline UIs in the CRM.
export function CustomerTimeline({ entries, timezone }: { entries: TimelineEntry[]; timezone: string }) {
  if (entries.length === 0) {
    return <EmptyState icon={HistoryIcon} message="No activity yet." />;
  }
  return (
    <ol className="space-y-1">
      {entries.map((e) => {
        const Icon = KIND_ICON[e.kind];
        return (
          <li key={e.id}>
            <Link
              href={entryHref(e)}
              className="hover:bg-muted/50 flex items-center gap-3 rounded-lg px-2 py-2 -mx-2"
            >
              <span className="bg-muted text-muted-foreground grid size-8 shrink-0 place-items-center rounded-full">
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1 truncate text-sm">{e.label}</span>
              <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
                {formatEpoch(e.at, { mode: "datetime", timeZone: timezone })}
              </span>
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
