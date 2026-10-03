import Link from "next/link";
import { isNotNull } from "drizzle-orm";
import { SectionCard } from "@foundry/design-system";
import { ChevronRightIcon } from "lucide-react";
import { db } from "@/db/client";
import { campaign } from "@/db/schema";
import { requireAdmin } from "@/lib/auth/guards";
import { ensureMenuReminder } from "@/lib/notifications/menu-reminder";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { formatEpoch } from "@/lib/format/datetime";

export const dynamic = "force-dynamic";

export default async function SystemCampaignsPage() {
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
      title="System campaigns"
      subtitle="Reusable sends to existing customers. Sent from the transactional address; each keeps its results, unsubscribes and logs."
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
                <p className="font-medium">{r.name}</p>
                <p className="text-sm text-muted-foreground">
                  {r.sentAt ? `Last sent ${formatEpoch(r.sentAt, { mode: "datetime", timeZone: timezone })}` : "Not sent yet"}
                  {" · "}
                  {counts.queued ?? 0} queued · {counts.delivered ?? 0} delivered
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
