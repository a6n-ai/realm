import { Suspense } from "react";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { buildCampaignConfig, buildUnsubscribeUrl, countAudience, withPreviewFooter, type AudienceDef } from "@relay/engine";
import { BackButton, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { campaign, campaignContent, contactList, messageSuppression } from "@/db/schema";
import { notificationTables, usersRef } from "@/lib/notifications/tables";
import { resolveSegment } from "@/lib/campaigns/segment";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadNotificationLogs, LOGS_SPEC } from "@/lib/notifications/logs-query";
import {
  CampaignAnalytics,
  CampaignAudienceEditor,
  CampaignCompleteButton,
  CampaignContentSection,
  CampaignDeleteButton,
  CampaignDuplicateButton,
  CampaignRetriggerButton,
  CampaignSendButton,
  formatConsentDate,
  type AudienceValue,
} from "@relay/engine/ui";
import { LogsTable, LogsTableSkeleton } from "../../logs/logs-table";

// Resolves a live audience count on every view.
export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | undefined>>;

export default async function CampaignPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: SearchParams;
}) {
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
  const retriggerable =
    row.status === "sent" || row.status === "completed" || row.status === "paused" || row.status === "cancelled";
  // Only resolve a count when it can still be acted on — for a sent campaign
  // the stored counts are the record, and re-resolving would show today's
  // audience rather than the one that was actually mailed.
  const [content, count, lists, { timezone }, unsubscribes] = await Promise.all([
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
    db
      .select({
        address: messageSuppression.address,
        channel: messageSuppression.channel,
        createdAt: messageSuppression.createdAt,
      })
      .from(messageSuppression)
      .where(eq(messageSuppression.campaignId, row.id))
      .orderBy(desc(messageSuppression.createdAt)),
  ]);

  const counts = (row.counts ?? {}) as Record<string, number>;

  const campaignConfig = buildCampaignConfig(notificationTables, process.env, { senderName: "TiffinGrab" });
  const footer = campaignConfig
    ? {
        url: buildUnsubscribeUrl(campaignConfig.unsubscribe.baseUrl, campaignConfig.unsubscribe.secret, "preview@example.com"),
        sender: campaignConfig.sender.name,
        address: campaignConfig.sender.postalAddress,
      }
    : undefined;
  const previewContent = footer ? withPreviewFooter(content, footer) : content;

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
          {sendable && <CampaignDeleteButton campaignPublicId={row.publicId} name={row.name} />}
          {row.status === "sent" && <CampaignCompleteButton campaignPublicId={row.publicId} />}
          {retriggerable && <CampaignRetriggerButton campaignPublicId={row.publicId} lists={lists} />}
          {sendable && <CampaignSendButton campaignPublicId={row.publicId} count={count} />}
        </div>
      </div>

      {sendable ? (
        <>
          <SectionCard title="Audience" subtitle="Recomputed now — suppressions and unsubscribes already removed.">
            <CampaignAudienceEditor
              campaignPublicId={row.publicId}
              audience={row.audience as AudienceValue}
              count={count}
              lists={lists}
              requiresVerifiedPhone={(row.channels as string[]).some((c) => c === "sms" || c === "whatsapp")}
              timeZone={timezone}
            />
          </SectionCard>
          <SectionCard title="Content" subtitle="One row per channel and locale.">
            <CampaignContentSection campaignPublicId={row.publicId} content={previewContent} editable={sendable} footer={footer} />
          </SectionCard>
        </>
      ) : (
        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-6 pt-4">
            <SectionCard title="Results" subtitle="Counts recorded at send time and from SES feedback.">
              <CampaignAnalytics counts={counts} />
            </SectionCard>
            <SectionCard title="Content" subtitle="One row per channel and locale.">
              <CampaignContentSection campaignPublicId={row.publicId} content={previewContent} editable={sendable} footer={footer} />
            </SectionCard>
            <SectionCard
              title="Unsubscribed"
              subtitle={
                unsubscribes.length > 0
                  ? "Opted out of marketing from this campaign's send."
                  : "No one has unsubscribed from this campaign."
              }
            >
              {unsubscribes.length > 0 && (
                <div className="divide-y">
                  {unsubscribes.map((u) => (
                    <div key={u.address} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="font-mono">{u.address}</span>
                      <span className="text-muted-foreground">{formatConsentDate(u.createdAt, timezone)}</span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </TabsContent>
          <TabsContent value="logs" className="pt-4">
            <SectionCard title="Logs" subtitle="Sends for this campaign.">
              <Suspense fallback={<LogsTableSkeleton />}>
                <CampaignLogsData campaignId={row.id} searchParams={searchParams} />
              </Suspense>
            </SectionCard>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}

async function CampaignLogsData({ campaignId, searchParams }: { campaignId: bigint; searchParams: SearchParams }) {
  const sp = await searchParams;
  const { rows, sort, total, page, size } = await loadNotificationLogs(sp, { campaignId });
  return <LogsTable spec={LOGS_SPEC} rows={rows} sort={sort} total={total} page={page} size={size} />;
}
