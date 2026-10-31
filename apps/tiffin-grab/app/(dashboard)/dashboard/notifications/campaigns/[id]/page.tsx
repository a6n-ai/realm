import { Suspense } from "react";
import { notFound } from "next/navigation";
import { and, desc, eq } from "drizzle-orm";
import { campaignFromLine, buildUnsubscribeUrl, withPreviewFooter } from "@relay/engine";
import { BackButton, SectionCard } from "@foundry/design-system";
import { Badge } from "@foundry/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@foundry/ui/tabs";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { campaign, campaignContent, contactList, messageSuppression } from "@/db/schema";
import { notificationTables } from "@/lib/notifications/tables";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import { createLogger } from "@foundry/commons/logger";
import { syncAllGroupContactLists } from "@/lib/services/customer-groups.service";
import { getAppSettings } from "@/lib/services/app-settings.service";
import { loadNotificationLogs, LOGS_SPEC } from "@/lib/notifications/logs-query";
import { CampaignAnalytics } from "@relay/engine/ui/campaign-analytics";
import { CampaignCompleteButton } from "@relay/engine/ui/campaign-complete-button";
import { CampaignContentSection } from "@relay/engine/ui/campaign-content-section";
import { CampaignFlow } from "@relay/engine/ui/campaign-flow/campaign-flow";
import { CampaignDeleteButton } from "@relay/engine/ui/campaign-delete-button";
import { CampaignDuplicateButton } from "@relay/engine/ui/campaign-duplicate-button";
import { CampaignRetriggerButton } from "@relay/engine/ui/campaign-retrigger-button";
import { CampaignRetryFailedButton } from "@relay/engine/ui/campaign-retry-failed-button";
import { formatConsentDate } from "@relay/engine/ui/date";
import { parseStep } from "@relay/engine/ui/campaign-flow/steps";
import type { AudienceValue } from "@relay/engine/ui/audience-builder";
import { LogsTable, LogsTableSkeleton } from "../../logs/logs-table";
import { ResubscribeLinkButton } from "../../resubscribe-link-button";
import { BulkRuns } from "./bulk-runs";

const log = createLogger("campaign-page");

// Oldest notification_outbox row in prod: earlier per-recipient send rows were lost.
const OUTBOX_KEPT_SINCE = Date.UTC(2026, 8, 28, 11);

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
      systemKey: campaign.systemKey,
    })
    .from(campaign)
    .where(eq(campaign.publicId, id));
  if (!row) notFound();

  // A system campaign is re-run, never sent once: no send/retrigger lifecycle,
  // and its content stays editable as the template for the next run.
  const isSystem = row.systemKey != null;
  const sendable = !isSystem && (row.status === "draft" || row.status === "scheduled");
  // Delivery sends each row once; failed rows wait here for an admin to retry.
  const failedCount = await db.$count(
    notificationTables.notificationOutbox,
    and(
      eq(notificationTables.notificationOutbox.campaignId, row.id),
      eq(notificationTables.notificationOutbox.status, "failed"),
    ),
  );
  const retriggerable =
    !isSystem &&
    (row.status === "sent" || row.status === "completed" || row.status === "paused" || row.status === "cancelled");
  try {
    await syncAllGroupContactLists();
  } catch (e) {
    log.error({ err: e }, "customer group list catch-up failed");
  }
  const [content, lists, { timezone }, unsubscribes] = await Promise.all([
    db
      .select({
        channel: campaignContent.channel,
        locale: campaignContent.locale,
        subject: campaignContent.subject,
        body: campaignContent.body,
        html: campaignContent.html,
        text: campaignContent.text,
        revision: campaignContent.revision,
        providerTemplateId: campaignContent.providerTemplateId,
        attachments: campaignContent.attachments,
      })
      .from(campaignContent)
      .where(eq(campaignContent.campaignId, row.id)),
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

  const config = await campaignConfig();

  const from = campaignFromLine(config);
  const footer = config
    ? {
        url: buildUnsubscribeUrl(config.unsubscribe.baseUrl, config.unsubscribe.secret, "preview@example.com"),
        sender: config.sender.name,
        address: config.sender.postalAddress,
      }
    : undefined;
  const previewContent = footer ? withPreviewFooter(content, footer) : content;

  if (sendable) {
    const channel = (row.channels as string[])[0] ?? "email";
    return (
      <div className="space-y-4">
        <div className="flex justify-end gap-2">
          <CampaignDuplicateButton campaignPublicId={row.publicId} campaignName={row.name} lists={lists} timeZone={timezone} />
          <CampaignDeleteButton campaignPublicId={row.publicId} name={row.name} />
        </div>
        <CampaignFlow
          campaignPublicId={row.publicId}
          name={row.name}
          status={row.status as "draft" | "scheduled"}
          step={parseStep((await searchParams).step)}
          channel={channel}
          content={content.find((c) => c.channel === channel) ?? null}
          audience={row.audience as AudienceValue}
          lists={lists}
          timeZone={timezone}
          footer={footer}
          from={from}
          unsubscribedHref="/dashboard/notifications/unsubscribed"
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <BackButton
        href={isSystem ? "/dashboard/notifications/templates" : "/dashboard/notifications/campaigns"}
        label={isSystem ? "Templates" : "All campaigns"}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-balance">{row.name}</h1>
          <p className="text-sm text-muted-foreground">
            <Badge variant="outline">{isSystem ? "bulk" : row.status}</Badge>{" "}
            <span className="ml-2">{(row.channels as string[]).join(", ")}</span>
          </p>
        </div>
        <div className="flex gap-2">
          {!isSystem && (
            <CampaignDuplicateButton campaignPublicId={row.publicId} campaignName={row.name} lists={lists} timeZone={timezone} />
          )}
          {!isSystem && row.status === "sent" && <CampaignCompleteButton campaignPublicId={row.publicId} />}
          {retriggerable && <CampaignRetriggerButton campaignPublicId={row.publicId} lists={lists} />}
          {failedCount > 0 && (
            <CampaignRetryFailedButton campaignPublicId={row.publicId} failedCount={failedCount} />
          )}
        </div>
      </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            {isSystem && <TabsTrigger value="runs">Bulk runs</TabsTrigger>}
            <TabsTrigger value="logs">Logs</TabsTrigger>
          </TabsList>
          <TabsContent value="overview" className="space-y-6 pt-4">
            <SectionCard
              title="Results"
              subtitle={isSystem ? "All runs combined, from SES feedback." : "Counts recorded at send time and from SES feedback."}
            >
              <CampaignAnalytics counts={counts} />
            </SectionCard>
            <SectionCard title="Content" subtitle="One row per channel and locale.">
              <CampaignContentSection autosaveDraft={row.status === "draft" && !isSystem} campaignPublicId={row.publicId} content={previewContent} editable={isSystem} footer={footer} from={from} />
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
                      <span className="flex items-center gap-2 text-muted-foreground">
                        {formatConsentDate(u.createdAt, timezone)}
                        <ResubscribeLinkButton address={u.address} />
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </SectionCard>
          </TabsContent>
          {isSystem && (
            <TabsContent value="runs" className="pt-4">
              <SectionCard title="Bulk runs" subtitle="Each send of this template, newest first. Opens come from SES and lag a little.">
                <Suspense fallback={null}>
                  <BulkRuns campaignId={row.id} timeZone={timezone} />
                </Suspense>
              </SectionCard>
            </TabsContent>
          )}
          <TabsContent value="logs" className="pt-4">
            <SectionCard
              title="Logs"
              subtitle={
                // Per-recipient rows from before 2026-09-28 were not kept; the counts on the campaign row were.
                row.sentAt != null && row.sentAt < OUTBOX_KEPT_SINCE
                  ? "Per-recipient logs start 28 Sep 2026; this campaign was sent before that. Results still has its totals."
                  : "Sends for this campaign."
              }
            >
              <Suspense fallback={<LogsTableSkeleton />}>
                <CampaignLogsData campaignId={row.id} searchParams={searchParams} />
              </Suspense>
            </SectionCard>
          </TabsContent>
        </Tabs>
    </div>
  );
}

async function CampaignLogsData({ campaignId, searchParams }: { campaignId: bigint; searchParams: SearchParams }) {
  const sp = await searchParams;
  const { rows, sort, total, page, size } = await loadNotificationLogs(sp, { campaignId });
  return <LogsTable spec={LOGS_SPEC} rows={rows} sort={sort} total={total} page={page} size={size} />;
}
