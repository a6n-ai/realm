import { orgScope, type Visible } from "@/lib/tenant/org-scope";
import { db } from "@/db/client";
import { deliveryFrequencies, deliveryZones, leadSources, leadSubsources, mealSizes, organization, plans } from "@/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import type { Option } from "@foundry/design-system";
import { listAssignableStaff } from "@/lib/staff/assignable-staff";

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

/** Orders-list filter options: plans, standard meal sizes, frequencies, and the zones/organizations the caller can see. */
export async function loadOrderFilterOptions(visible: Visible) {
  const [planOptions, sizeOptions, zoneOptions, orgOptions, frequencyOptions] = await Promise.all([
    db.select({ value: plans.key, label: plans.name }).from(plans).orderBy(plans.name),
    db.select({ value: mealSizes.key, label: mealSizes.name }).from(mealSizes).where(eq(mealSizes.custom, false)).orderBy(mealSizes.name),
    db.selectDistinct({ value: deliveryZones.name, label: deliveryZones.name }).from(deliveryZones)
      .where(and(eq(deliveryZones.active, true), orgScope(deliveryZones.organizationId, visible)))
      .orderBy(deliveryZones.name),
    visible === "all"
      ? db.select({ value: organization.id, label: organization.name }).from(organization).orderBy(organization.name)
      : visible.length > 1
        ? db.select({ value: organization.id, label: organization.name }).from(organization).where(inArray(organization.id, visible)).orderBy(organization.name)
        : [],
    db.select({ value: deliveryFrequencies.key, label: deliveryFrequencies.name }).from(deliveryFrequencies).orderBy(deliveryFrequencies.name),
  ]);
  return { planOptions, sizeOptions, zoneOptions, orgOptions, frequencyOptions };
}
