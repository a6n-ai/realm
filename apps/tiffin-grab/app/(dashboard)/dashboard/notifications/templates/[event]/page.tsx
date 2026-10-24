import { Suspense } from "react";
import { notFound } from "next/navigation";
import { buildUnsubscribeUrl } from "@relay/engine";
import { requireAdmin } from "@/lib/auth/guards";
import { appEvent } from "@/db/schema";
import { listTemplates, sampleMap } from "@/lib/services/notification-template.service";
import { availableVariables, type AppEvent } from "@/lib/notifications/event-entities";
import { campaignConfig } from "@/lib/notifications/campaign-config";
import { TemplateEditor, TemplateEditorSkeleton } from "@relay/engine/ui/template-editor";
import { eventLabel } from "@relay/engine/ui/template-status";
import { BackButton } from "@foundry/design-system";
import { SectionCard } from "@/components/ds";
import { Skeleton } from "@foundry/ui/skeleton";

export default function Page({ params }: { params: Promise<{ event: string }> }) {
  return (
    <div className="space-y-6">
      <BackButton href="/dashboard/notifications/templates" label="All templates" />
      <Suspense
        fallback={
          <div className="space-y-1">
            <Skeleton className="h-8 w-64" />
            <Skeleton className="h-4 w-80" />
          </div>
        }
      >
        <TemplateHeader params={params} />
      </Suspense>
      <SectionCard title="Template content">
        <Suspense fallback={<TemplateEditorSkeleton />}>
          <TemplateData params={params} />
        </Suspense>
      </SectionCard>
    </div>
  );
}

async function TemplateHeader({ params }: { params: Promise<{ event: string }> }) {
  await requireAdmin();
  const { event } = await params;
  if (!appEvent.enumValues.includes(event as AppEvent) || event === "manual_adjustment") notFound();

  return (
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold text-balance">{eventLabel(event)}</h1>
      <p className="text-sm text-muted-foreground">Email + in-app templates for this event, per locale.</p>
    </div>
  );
}

async function TemplateData({ params }: { params: Promise<{ event: string }> }) {
  await requireAdmin();
  const { event } = await params;
  if (!appEvent.enumValues.includes(event as AppEvent) || event === "manual_adjustment") notFound();

  const all = await listTemplates();
  const initial = all
    .filter((t) => t.event === event)
    .map((t) => ({
      channel: t.channel as "email" | "in_app",
      locale: t.locale as "en" | "fr",
      subject: t.subject,
      body: t.body ?? "",
      html: t.html ?? "",
      text: t.text ?? "",
      enabled: t.enabled,
      revision: t.revision,
    }));

  const config = await campaignConfig();
  const footer = config
    ? {
        url: buildUnsubscribeUrl(config.unsubscribe.baseUrl, config.unsubscribe.secret, "preview@example.com"),
        sender: config.sender.name,
        address: config.sender.postalAddress,
      }
    : undefined;

  return (
    <TemplateEditor samples={sampleMap(event as AppEvent)}
      event={event}
      variables={availableVariables(event as AppEvent)}
      initial={initial}
      footer={footer}
    />
  );
}
