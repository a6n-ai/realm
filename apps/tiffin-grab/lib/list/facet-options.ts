import type { Visible } from "@/lib/tenant/org-scope";
import { db } from "@/db/client";
import { deliveryFrequencies, deliveryZones, leadSources, leadSubsources, mealSizes, organization, plans } from "@/db/schema";
import { eq } from "drizzle-orm";
import type { Option } from "@foundry/design-system";
import { listAssignableStaff } from "@/lib/staff/assignable-staff";
import { filterOptionsCache } from "@/lib/list/filter-options-cache";

// Owner facet: readable public ids in the URL, resolved to internal ids by the
// service's subquery resolver. Scoped to assignable staff (the only users who
// can own an inquiry) via the shared predicate — avoids pulling every customer
// into the dropdown and an unbounded scan on the page's hot path.
export async function loadOwnerOptions(): Promise<Option[]> {
  const staff = await listAssignableStaff();
  return staff.map((s) => ({ value: s.publicId, label: s.name }));
}

export function loadSourceOptions(): Promise<{ sources: Option[]; subsources: Option[] }> {
  return filterOptionsCache.getOrSet("sources", async () => {
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
  });
}

/**
 * Orders-list filter options: plans, standard meal sizes, frequencies, and the zones/organizations the caller can see.
 * One cache entry holds every row; the caller's org scope is applied in memory, so no session value becomes a cache key.
 */
export async function loadOrderFilterOptions(visible: Visible) {
  const base = await filterOptionsCache.getOrSet("orders", fetchFilterBase);
  const zoneOptions = [...new Map(
    base.zones
      .filter((z) => visible === "all" || (visible.length > 0 && z.organizationId != null && visible.includes(z.organizationId)))
      .map((z) => [z.value, z] as const),
  ).values()].map(({ value, label }) => ({ value, label }));
  const orgOptions = visible === "all" ? base.orgs : visible.length > 1 ? base.orgs.filter((o) => visible.includes(o.value)) : [];
  return { planOptions: base.planOptions, sizeOptions: base.sizeOptions, zoneOptions, orgOptions, frequencyOptions: base.frequencyOptions };
}

async function fetchFilterBase() {
  const [planOptions, sizeOptions, zones, orgs, frequencyOptions] = await Promise.all([
    db.select({ value: plans.key, label: plans.name }).from(plans).orderBy(plans.name),
    db.select({ value: mealSizes.key, label: mealSizes.name }).from(mealSizes).where(eq(mealSizes.custom, false)).orderBy(mealSizes.name),
    db.select({ value: deliveryZones.name, label: deliveryZones.name, organizationId: deliveryZones.organizationId }).from(deliveryZones)
      .where(eq(deliveryZones.active, true))
      .orderBy(deliveryZones.name),
    db.select({ value: organization.id, label: organization.name }).from(organization).orderBy(organization.name),
    db.select({ value: deliveryFrequencies.key, label: deliveryFrequencies.name }).from(deliveryFrequencies).orderBy(deliveryFrequencies.name),
  ]);
  return { planOptions, sizeOptions, zones, orgs, frequencyOptions };
}
