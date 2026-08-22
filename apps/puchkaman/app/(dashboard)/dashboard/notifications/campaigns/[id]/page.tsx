import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeftIcon } from "lucide-react";
import { countAudience, type AudienceDef } from "@realm/notifications";
import { SectionCard, StatGrid } from "@realm/design-system";
import { Badge } from "@realm/ui/badge";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { campaign, campaignContent } from "@/db/schema";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";
import { CampaignSendButton } from "@realm/notifications/ui";

// Resolves a live audience count on every view.
export const dynamic = "force-dynamic";

const STAT_KEYS = [
  { key: "queued", label: "Queued" },
  { key: "delivered", label: "Delivered" },
  { key: "opened", label: "Opened" },
  { key: "clicked", label: "Clicked" },
  { key: "bounced", label: "Bounced" },
] as const;

export default async function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await params;

  const [row] = await db
    .select({
      id: campaign.id,
      publicId: campaign.publicId,
      name: campaign.name,
      channels: campaign.channels,
      status: campaign.status,
      audience: campaign.audience,
      counts: campaign.counts,
      sentAt: campaign.sentAt,
    })
    .from(campaign)
    .where(eq(campaign.publicId, id));
  if (!row) notFound();

  const content = await db
    .select({ channel: campaignContent.channel, locale: campaignContent.locale, subject: campaignContent.subject })
    .from(campaignContent)
    .where(eq(campaignContent.campaignId, row.id));

  const sendable = row.status === "draft" || row.status === "scheduled";
  // Only resolve a count when it can still be acted on — for a sent campaign
  // the stored counts are the record, and re-resolving would show today's
  // audience rather than the one that was actually mailed.
  const count = sendable
    ? await countAudience(
        { db, tables: notificationTables, users: usersRef, resolveSegment },
        row.audience as AudienceDef,
      )
    : 0;

  const counts = (row.counts ?? {}) as Record<string, number>;

  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/notifications/campaigns"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> All campaigns
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-balance">{row.name}</h1>
          <p className="text-sm text-muted-foreground">
            <Badge variant="outline">{row.status}</Badge>{" "}
            <span className="ml-2">{(row.channels as string[]).join(", ")}</span>
          </p>
        </div>
        {sendable && <CampaignSendButton campaignPublicId={row.publicId} count={count} />}
      </div>

      {sendable ? (
        <SectionCard title="Audience" subtitle="Recomputed now — suppressions and unsubscribes already removed.">
          <p className="text-sm">
            <span className="text-2xl font-semibold tabular-nums">{count}</span>{" "}
            <span className="text-muted-foreground">recipients</span>
          </p>
        </SectionCard>
      ) : (
        <SectionCard title="Results" subtitle="Counts recorded at send time and from SES feedback.">
          <StatGrid
            cols={5}
            items={STAT_KEYS.map((s) => ({ label: s.label, value: counts[s.key] ?? 0 }))}
          />
        </SectionCard>
      )}

      <SectionCard title="Content" subtitle="One row per channel and locale.">
        {content.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No content yet — a campaign with no content for a channel does not send on it.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm">
            {content.map((c) => (
              <li key={`${c.channel}-${c.locale}`} className="flex items-center justify-between">
                <span className="text-muted-foreground">
                  {c.channel} · {c.locale}
                </span>
                <span className="font-medium">{c.subject}</span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}
