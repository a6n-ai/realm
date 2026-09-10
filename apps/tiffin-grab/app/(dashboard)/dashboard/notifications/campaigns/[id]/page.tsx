import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { countAudience, type AudienceDef } from "@relay/engine";
import { BackButton, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { campaign, campaignContent, contactList } from "@/db/schema";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";
import { getAppSettings } from "@/lib/services/app-settings.service";
import {
  CampaignAnalytics,
  CampaignContentSection,
  CampaignDuplicateButton,
  CampaignRetriggerButton,
  CampaignSendButton,
} from "@relay/engine/ui";

// Resolves a live audience count on every view.
export const dynamic = "force-dynamic";

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

  const sendable = row.status === "draft" || row.status === "scheduled";
  const retriggerable = row.status === "sent" || row.status === "paused" || row.status === "cancelled";
  // Only resolve a count when it can still be acted on — for a sent campaign
  // the stored counts are the record, and re-resolving would show today's
  // audience rather than the one that was actually mailed.
  const [content, count, lists, { timezone }] = await Promise.all([
    db
      .select({
        channel: campaignContent.channel,
        locale: campaignContent.locale,
        subject: campaignContent.subject,
        body: campaignContent.body,
        html: campaignContent.html,
        text: campaignContent.text,
        providerTemplateId: campaignContent.providerTemplateId,
        attachments: campaignContent.attachments,
      })
      .from(campaignContent)
      .where(eq(campaignContent.campaignId, row.id)),
    sendable
      ? countAudience(
          { db, tables: notificationTables, users: usersRef, resolveSegment },
          row.audience as AudienceDef,
        )
      : Promise.resolve(0),
    db
      .select({
        publicId: contactList.publicId,
        name: contactList.name,
        consentSource: contactList.consentSource,
        consentAt: contactList.consentAt,
        memberCount: contactList.memberCount,
      })
      .from(contactList)
      .orderBy(desc(contactList.createdAt)),
    getAppSettings(),
  ]);

  const counts = (row.counts ?? {}) as Record<string, number>;

  return (
    <div className="space-y-6">
      <BackButton href="/dashboard/notifications/campaigns" label="All campaigns" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-balance">{row.name}</h1>
          <p className="text-sm text-muted-foreground">
            <Badge variant="outline">{row.status}</Badge>{" "}
            <span className="ml-2">{(row.channels as string[]).join(", ")}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <CampaignDuplicateButton campaignPublicId={row.publicId} lists={lists} timeZone={timezone} />
          {retriggerable && <CampaignRetriggerButton campaignPublicId={row.publicId} lists={lists} />}
          {sendable && <CampaignSendButton campaignPublicId={row.publicId} count={count} />}
        </div>
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
          <CampaignAnalytics counts={counts} />
        </SectionCard>
      )}

      <SectionCard title="Content" subtitle="One row per channel and locale.">
        <CampaignContentSection campaignPublicId={row.publicId} content={content} editable={sendable} />
      </SectionCard>
    </div>
  );
}
