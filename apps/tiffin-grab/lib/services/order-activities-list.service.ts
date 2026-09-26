import type { Condition, FilterCondition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { columnResolver, conditionToSql } from "@foundry/database";
import { asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { orderActivities, orders, users } from "@/db/schema";
import type { SortState } from "@/lib/list/sort";
import { LOG_ACTIVITY_CATEGORY_TYPES } from "@/lib/order-activity/log-facets";
import {
  describeActivity,
  describeActivityActor,
} from "@/lib/services/order-activity-describe";

export type ActivitySortColumn = "time" | "customer" | "action" | "actor";

export type ActivityListRow = {
  publicId: string;
  type: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  createdAt: number;
  createdBy: bigint | null;
  action: string;
  actorLabel: string;
  actorKind: "system" | "staff" | "customer";
  actorName: string | null;
  actorEmail: string | null;
  customerName: string;
  orderPublicId: string;
  orderDeploymentId: string;
};

const actor = alias(users, "activity_actor");

const SORT_COL = {
  time: orderActivities.createdAt,
  customer: orders.fullName,
  action: orderActivities.type,
  actor: actor.name,
} as const;

function valuesOf(f: FilterCondition): string[] {
  return f.operator === "in" ? (f.value as string[]) : [f.value as string];
}

function activitiesResolver() {
  const base = columnResolver({
    type: orderActivities.type,
    createdAt: orderActivities.createdAt,
    note: orderActivities.note,
    customerName: orders.fullName,
    actorName: actor.name,
    actorEmail: actor.email,
    orderPublicId: orders.publicId,
  });

  return (f: FilterCondition) => {
    if (f.field === "category") {
      const cat = f.value as string;
      if (!(cat in LOG_ACTIVITY_CATEGORY_TYPES)) return undefined;
      const types = LOG_ACTIVITY_CATEGORY_TYPES[cat as keyof typeof LOG_ACTIVITY_CATEGORY_TYPES];
      return inArray(orderActivities.type, [...types]);
    }
    if (f.field === "actorKind") {
      const kind = valuesOf(f)[0];
      if (kind === "system") return isNull(orderActivities.createdBy);
      if (kind === "staff") return inArray(actor.role, ["admin", "member"]);
      if (kind === "customer") return eq(actor.role, "user");
      return undefined;
    }
    return base(f);
  };
}

/**
 * Cross-order activity feed for Settings → Logs.
 * Writes still go through order flows; this is read-only listing.
 */
export async function listOrderActivitiesPage(
  condition: Condition | undefined,
  page: PageRequest,
  sort: SortState<ActivitySortColumn> = { column: "time", dir: "desc" },
): Promise<Page<ActivityListRow>> {
  const where = conditionToSql(condition, activitiesResolver());
  const col = SORT_COL[sort.column] ?? orderActivities.createdAt;
  const orderBy = sort.dir === "asc" ? asc(col) : desc(col);

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        publicId: orderActivities.publicId,
        type: orderActivities.type,
        note: orderActivities.note,
        fromStatus: orderActivities.fromStatus,
        toStatus: orderActivities.toStatus,
        createdAt: orderActivities.createdAt,
        createdBy: orderActivities.createdBy,
        actorName: actor.name,
        actorEmail: actor.email,
        actorRole: actor.role,
        customerName: orders.fullName,
        orderPublicId: orders.publicId,
        orderDeploymentId: orders.deploymentId,
      })
      .from(orderActivities)
      .innerJoin(orders, eq(orders.id, orderActivities.orderId))
      .leftJoin(actor, eq(actor.id, orderActivities.createdBy))
      .where(where)
      .orderBy(orderBy)
      .limit(page.size)
      .offset(page.page * page.size),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(orderActivities)
      .innerJoin(orders, eq(orders.id, orderActivities.orderId))
      .leftJoin(actor, eq(actor.id, orderActivities.createdBy))
      .where(where),
  ]);

  return {
    items: rows.map((r) => {
      const who = describeActivityActor({
        createdBy: r.createdBy,
        actorName: r.actorName,
        actorEmail: r.actorEmail,
        actorRole: r.actorRole,
      });
      return {
        publicId: r.publicId,
        type: r.type,
        note: r.note,
        fromStatus: r.fromStatus,
        toStatus: r.toStatus,
        createdAt: r.createdAt,
        createdBy: r.createdBy,
        action: describeActivity(r),
        actorLabel: who.label,
        actorKind: who.kind,
        actorName: r.actorName,
        actorEmail: r.actorEmail,
        customerName: r.customerName,
        orderPublicId: r.orderPublicId,
        orderDeploymentId: r.orderDeploymentId,
      };
    }),
    page: page.page,
    size: page.size,
    total: count,
  };
}
