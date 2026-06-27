import { asc } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth/guards";
import { db } from "@/db/client";
import { leadSources, leadSubsources } from "@/db/schema";
import { LeadSourcesManager } from "./manager";

export default async function LeadSourcesSettingsPage() {
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

  // Group sub-sources under their parent and project to strings only — the
  // bigint ids never leave the server.
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
