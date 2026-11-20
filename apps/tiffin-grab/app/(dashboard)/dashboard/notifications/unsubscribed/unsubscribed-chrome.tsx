import type { ReactNode } from "react";
import { Skeleton } from "@foundry/ui/skeleton";
import { SectionCard } from "@/components/ds";
import { ManualSuppress } from "./suppression-actions";

export const SUPPRESSION_LABELS = { unsubscribe: "Unsubscribed", bounce: "Bounced", complaint: "Complained", manual: "Blocked by staff" } as const;

export type SuppressionSummary = { total: Record<keyof typeof SUPPRESSION_LABELS, number>; thisMonth: Record<keyof typeof SUPPRESSION_LABELS, number>; last30: Record<keyof typeof SUPPRESSION_LABELS, number> };

// Everything on the Unsubscribed page that needs no data. Without a summary the numbers are skeletons.
export function UnsubscribedChrome({ summary, query = "", list }: { summary?: SuppressionSummary; query?: string; list: ReactNode }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {(Object.keys(SUPPRESSION_LABELS) as (keyof typeof SUPPRESSION_LABELS)[]).map((k) => (
          <div key={k} className="bg-card rounded-xl border p-4">
            <p className="text-muted-foreground text-sm">{SUPPRESSION_LABELS[k]}</p>
            {summary ? (
              <>
                <p className="text-title-1 font-semibold tabular-nums">{summary.total[k].toLocaleString()}</p>
                <p className="text-muted-foreground text-xs tabular-nums">
                  {summary.thisMonth[k]} this month · {summary.last30[k]} in 30 days
                </p>
              </>
            ) : (
              <div className="flex flex-col gap-2 pt-1">
                <Skeleton className="h-8 w-16" />
                <Skeleton className="h-3 w-32" />
              </div>
            )}
          </div>
        ))}
      </div>
      <SectionCard
        title="Unsubscribed and suppressed"
        subtitle="No marketing is sent to these addresses. An unsubscribe can only be reversed by the recipient."
        action={
          <div className="flex items-center gap-3">
            <a className="text-sm underline underline-offset-2" href={`/api/notifications/unsubscribed/export?${query}`}>
              Export CSV
            </a>
            <ManualSuppress />
          </div>
        }
      >
        {list}
      </SectionCard>
    </div>
  );
}
