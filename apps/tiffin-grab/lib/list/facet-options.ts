import { db } from "@/db/client";
import { leadSources, leadSubsources } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Option } from "@/components/ds";
import { listAssignableStaff } from "@/lib/services/assignable-staff";

// Owner facet: readable public ids in the URL, resolved to internal ids by the
// service's subquery resolver. Scoped to assignable staff (the only users who
// can own an inquiry) via the shared predicate — avoids pulling every customer
// into the dropdown and an unbounded scan on the page's hot path.
export async function loadOwnerOptions(): Promise<Option[]> {
  const staff = await listAssignableStaff();
  return staff.map((s) => ({ value: s.publicId, label: s.name }));
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
