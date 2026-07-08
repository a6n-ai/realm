import { db } from "@/db/client";
import { users, leadSources, leadSubsources } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Option } from "@/components/ds";

// Owner facet: readable public ids in the URL, resolved to internal ids by the
// service's subquery resolver. Non-staff never own inquiries, so an owner they
// can't match is harmless — but keep the list to real assignable staff would be
// a future refinement (see facet-options concern in the task report).
export async function loadOwnerOptions(): Promise<Option[]> {
  const rows = await db.select({ value: users.publicId, label: users.name }).from(users);
  return rows.map((r) => ({ value: r.value, label: r.label ?? r.value }));
}

export async function loadSourceOptions(): Promise<{ sources: Option[]; subsources: Option[] }> {
  const s = await db
    .select({ value: leadSources.key, label: leadSources.label })
    .from(leadSources);
  const ss = await db
    .select({ value: leadSubsources.key, label: leadSubsources.label, parentKey: leadSources.key })
    .from(leadSubsources)
    .innerJoin(leadSources, eq(leadSubsources.sourceId, leadSources.id));
  return {
    sources: s.map((r) => ({ value: r.value, label: r.label })),
    subsources: ss.map((r) => ({ value: r.value, label: r.label, parent: r.parentKey })),
  };
}
