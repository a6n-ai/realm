import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { appEvent } from "@/db/schema";
import { listTemplates } from "@/lib/services/notification-template.service";
import { availableVariables, type AppEvent } from "@/lib/notifications/event-entities";
import { TemplateEditor, TemplateEditorSkeleton } from "@/components/notifications/template-editor";
import { eventLabel } from "@/components/notifications/template-status";
import { SectionCard } from "@/components/ds";
import { Skeleton } from "@/components/ui/skeleton";

export default function Page({ params }: { params: Promise<{ event: string }> }) {
  return (
    <div className="space-y-6">
      <Link
        href="/dashboard/notifications/templates"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> All templates
      </Link>
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
    }));

  return <TemplateEditor event={event} variables={availableVariables(event as AppEvent)} initial={initial} />;
}
