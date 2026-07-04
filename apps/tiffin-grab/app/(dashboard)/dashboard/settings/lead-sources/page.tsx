import { Suspense } from "react";
import { asc } from "drizzle-orm";
import { Webhook } from "lucide-react";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { leadSources, leadSubsources } from "@/db/schema";
import { PageHeader } from "@/components/ds";
import { LeadSourcesManager, LeadSourcesManagerSkeleton } from "./manager";

export default function LeadSourcesSettingsPage() {
  return (
    <div className="grid gap-6">
      <PageHeader icon={Webhook} title="Lead sources" />
      <Suspense fallback={<LeadSourcesManagerSkeleton />}>
        <LeadSourcesData />
      </Suspense>
    </div>
  );
}

async function LeadSourcesData() {
  await requireAdmin();

  const [srcRows, subRows] = await Promise.all([
    db
      .select({
        id: leadSources.id,
        publicId: leadSources.publicId,
        key: leadSources.key,
        label: leadSources.label,
        isInbound: leadSources.isInbound,
        active: leadSources.active,
      })
      .from(leadSources)
      .orderBy(asc(leadSources.label)),
    db
      .select({
        publicId: leadSubsources.publicId,
        sourceId: leadSubsources.sourceId,
        key: leadSubsources.key,
        label: leadSubsources.label,
        active: leadSubsources.active,
      })
      .from(leadSubsources)
      .orderBy(asc(leadSubsources.label)),
  ]);

  const sources = srcRows.map((s) => ({
    publicId: s.publicId,
    key: s.key,
    label: s.label,
    isInbound: s.isInbound,
    active: s.active,
    subs: subRows
      .filter((ss) => ss.sourceId === s.id)
      .map((ss) => ({ publicId: ss.publicId, key: ss.key, label: ss.label, active: ss.active })),
  }));

  return <LeadSourcesManager sources={sources} />;
}
