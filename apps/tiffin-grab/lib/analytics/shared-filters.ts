import { orgScope, type Visible, noVisibleOrgs } from "@/lib/tenant/org-scope";
import { and, asc, eq, exists } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryZones, mealSizes, orders, organization, plans, tickets } from "@/db/schema";
import { ticketOrgWhere } from "@/lib/support/complaint-filters";
import { noOrgs } from "./metrics/scope";
import type { AnalyticsFilterOptions } from "./shared-filter-params";

/** `visibleOrgIds` limits the franchise list (the session's visible set). */
export async function getAnalyticsFilterOptions(
  visibleOrgIds: Visible,
): Promise<AnalyticsFilterOptions> {
  const hasNoOrgs = noOrgs({ orgIds: visibleOrgIds });
  const orderOrg = ticketOrgWhere(visibleOrgIds);
  const hasOrder = (col: typeof orders.mealSizeId | typeof orders.zoneId, id: typeof mealSizes.id | typeof deliveryZones.id) =>
    exists(db.select({ one: orders.id }).from(orders).where(and(eq(col, id), orderOrg)));
  const [planRows, sizeRows, zoneRows, orgRows, ticketRows] = await Promise.all([
    db
      .select({ value: plans.key, label: plans.name })
      .from(plans)
      .where(eq(plans.active, true))
      .orderBy(asc(plans.name)),
    db
      .select({ value: mealSizes.key, label: mealSizes.name, parent: plans.key })
      .from(mealSizes)
      .innerJoin(plans, eq(mealSizes.planId, plans.id))
      .where(and(eq(mealSizes.active, true), eq(mealSizes.custom, false), hasOrder(orders.mealSizeId, mealSizes.id)))
      .orderBy(asc(mealSizes.name)),
    noVisibleOrgs(visibleOrgIds)
      ? Promise.resolve([])
      : db
          .selectDistinct({ value: deliveryZones.name, label: deliveryZones.name })
          .from(deliveryZones)
          .where(
            and(
              eq(deliveryZones.active, true),
              hasOrder(orders.zoneId, deliveryZones.id),
              orgScope(deliveryZones.organizationId, visibleOrgIds),
            ),
          )
          .orderBy(asc(deliveryZones.name)),
    noVisibleOrgs(visibleOrgIds)
      ? Promise.resolve([])
      : db
          .select({ value: organization.id, label: organization.name })
          .from(organization)
          .where(orgScope(organization.id, visibleOrgIds))
          .orderBy(asc(organization.name)),
    hasNoOrgs
      ? Promise.resolve([])
      : db
          .selectDistinct({ category: tickets.category, subcategory: tickets.subcategory })
          .from(tickets)
          .leftJoin(orders, eq(tickets.orderId, orders.id))
          .where(ticketOrgWhere(visibleOrgIds)),
  ]);
  return {
    plans: planRows,
    mealSizes: sizeRows,
    zones: zoneRows,
    orgs: orgRows,
    tickets: ticketRows.flatMap((t) => (t.subcategory ? [{ category: t.category, subcategory: t.subcategory }] : [{ category: t.category }])),
  };
}
