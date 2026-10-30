import { FileSearchIcon } from "lucide-react";
import { SectionCard } from "@/components/ds";
import { Badge } from "@/components/reui/badge";
import { needsReviewRows, REVIEW_REASON_LABEL } from "@/lib/services/analytics/metrics/needs-review";
import type { AnalyticsScope } from "@/lib/services/analytics/metrics/scope";
import { NeedsReviewTable } from "./needs-review-table";

export async function NeedsReview({ scope }: { scope: AnalyticsScope }) {
  const rows = await needsReviewRows(scope);
  return (
    <SectionCard
      title="Needs review"
      subtitle="Cancelled-but-paid money is included in revenue."
      action={rows.length > 0 ? <Badge variant="warning-light">{rows.length}</Badge> : undefined}
    >
      {rows.length === 0 ? (
        <div className="text-muted-foreground flex items-center gap-2 text-sm">
          <FileSearchIcon className="size-4" />
          Nothing to review in this range
        </div>
      ) : (
        <NeedsReviewTable
          rows={rows.map((r) => ({
            id: r.orderPublicId,
            href: `/dashboard/orders/${r.orderPublicId}`,
            deploymentId: r.deploymentId,
            fullName: r.fullName,
            status: r.status,
            paid: r.paid,
            total: r.total,
            diff: r.diff,
            reason: r.reasons.map((x) => REVIEW_REASON_LABEL[x]).join(", "),
          }))}
        />
      )}
    </SectionCard>
  );
}
