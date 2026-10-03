import Link from "next/link";
import { isNotNull } from "drizzle-orm";
import { ChevronRightIcon } from "lucide-react";
import { Badge } from "@foundry/ui/badge";
import { SectionCard } from "@/components/ds";
import { db } from "@/db/client";
import { requireAdmin } from "@/lib/auth/guards";
import { campaign } from "@/db/schema";
import { ensureMenuReminder } from "@/lib/notifications/menu-reminder";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { formatEpoch } from "@/lib/format/datetime";

/**
 * Bulk templates: reusable sends to existing customers (weekly menu reminder).
 * Backed by a system campaign, so each keeps results, unsubscribes, logs and
 * its run history on the campaign page this links to.
 */
export async function BulkTemplates() {
  // Own guard, not just the layout's: this render writes (seeds the reminder).
  await requireAdmin();
  // Seeded on first view so staff can review the copy before the first send.
  await ensureMenuReminder();
  const [rows, { timezone }] = await Promise.all([
    db
      .select({ publicId: campaign.publicId, name: campaign.name, sentAt: campaign.sentAt, counts: campaign.counts })
      .from(campaign)
      .where(isNotNull(campaign.systemKey)),
    getAppSettings(),
  ]);

  return (
    <SectionCard
      title="Bulk templates"
      subtitle="Sent to many customers at once from the transactional address. Open one for its runs, results, unsubscribes and logs."
    >
      <div className="divide-y">
        {rows.map((r) => {
          const counts = (r.counts ?? {}) as Record<string, number>;
          return (
            <Link
              key={r.publicId}
              href={`/dashboard/notifications/campaigns/${r.publicId}`}
              className="flex items-center justify-between gap-3 py-3 hover:bg-muted/40"
            >
              <div className="min-w-0">
                <p className="flex items-center gap-2 font-medium">
                  {r.name} <Badge variant="outline">Bulk</Badge>
                </p>
                <p className="text-sm text-muted-foreground">
                  {r.sentAt ? `Last run ${formatEpoch(r.sentAt, { mode: "datetime", timeZone: timezone })}` : "Not sent yet"}
                  {" · "}
                  {counts.queued ?? 0} queued · {counts.delivered ?? 0} delivered · {counts.opened ?? 0} opens
                </p>
              </div>
              <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </SectionCard>
  );
}
