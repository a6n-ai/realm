import type { Condition, FilterCondition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { columnResolver, conditionToSql } from "@foundry/database";
import { and, asc, desc, eq, inArray, like, or, sql, type SQL } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { db } from "@/db/client";
import { auditLog, customerAddresses, orderActivities, orders, users } from "@/db/schema";
import {
  CUSTOMER_ACTIVITY_ACTION_LABELS,
  CUSTOMER_ACTIVITY_CATEGORY_ACTIONS,
  categoryForCustomerAction,
  type CustomerActivityAction,
  type CustomerActivityCategory,
} from "@/lib/customer-activity/log-facets";
import type { SortState } from "@/lib/list/sort";

export type CustomerActivitySortColumn = "time";

export type CustomerActivityListRow = {
  publicId: string;
  category: CustomerActivityCategory;
  actionKey: CustomerActivityAction;
  action: string;
  details: string | null;
  createdAt: number;
  customerName: string;
  customerEmail: string;
  customerPublicId: string;
  /** Who made the change: "Customer", a staff member's name, or "System". */
  by: string;
  href: string;
  contextLabel: string;
};

type OrderActivityType = typeof orderActivities.$inferSelect.type;
type AuditOperation = typeof auditLog.$inferSelect.operation;
type Changes = Record<string, unknown> | null;

const ORDER_ACTIONS = {
  meal_pick: "meal_saved",
  category_swap_applied: "meal_customization_saved",
  category_swap_removed: "meal_customization_saved",
  delivery_address_changed: "delivery_address_changed",
  skipped: "tiffin_held",
  unskipped: "tiffin_restored",
  pool_scheduled: "tiffin_rescheduled",
  paused: "vacation_started",
  resumed: "vacation_ended",
  cancelled: "subscription_cancelled",
  payment_claimed: "payment_submitted",
} as const satisfies Partial<Record<OrderActivityType, CustomerActivityAction>>;

const ORDER_TYPES = Object.keys(ORDER_ACTIONS) as (keyof typeof ORDER_ACTIONS)[];
const orderActor = alias(users, "customer_activity_order_actor");
const orderCustomer = alias(users, "customer_activity_order_customer");
const auditActor = alias(users, "customer_activity_audit_actor");
const auditCustomer = alias(users, "customer_activity_audit_customer");
// Plan-level address moves (address-propagation.ts) are logged as notes with this prefix.
const addressNote = and(eq(orderActivities.type, "note"), like(orderActivities.note, "Delivery address changed%"))!;
const ADDRESS_FIELDS = [
  "addressLine",
  "addressUnit",
  "city",
  "postalCode",
  "province",
  "addressTagId",
  "deliveryStrategyId",
] as const;
const PREFERENCE_FIELDS = ["dietaryNotes", "allergens"] as const;
const RELEVANT_USER_FIELDS = [...ADDRESS_FIELDS, ...PREFERENCE_FIELDS, "deliveryNotes"] as const;

function valuesOf(filter: FilterCondition): string[] {
  return filter.operator === "in" ? (filter.value as string[]) : [filter.value as string];
}

function orderTypesForActions(actions: readonly string[]): OrderActivityType[] {
  return ORDER_TYPES.filter((type) => actions.includes(ORDER_ACTIONS[type]));
}

function orderActionsSql(actions: readonly string[]): SQL {
  const byType = inArray(orderActivities.type, orderTypesForActions(actions));
  return actions.includes("delivery_address_changed") ? or(byType, addressNote)! : byType;
}

function byLabel(actorId: bigint | null, customerId: bigint, actorName: string | null, actorEmail: string | null): string {
  if (actorId == null) return "System";
  if (actorId === customerId) return "Customer";
  return actorName ?? actorEmail ?? "Staff";
}

function orderResolver() {
  const base = columnResolver({
    createdAt: orderActivities.createdAt,
    customerName: orders.fullName,
    customerEmail: orderCustomer.email,
    details: orderActivities.note,
    orderPublicId: orders.publicId,
    entityPublicId: orderActivities.publicId,
  });

  return (filter: FilterCondition) => {
    if (filter.field === "action") return orderActionsSql(valuesOf(filter));
    if (filter.field === "category") {
      const actions = valuesOf(filter).flatMap((category) =>
        category in CUSTOMER_ACTIVITY_CATEGORY_ACTIONS
          ? [...CUSTOMER_ACTIVITY_CATEGORY_ACTIONS[
              category as keyof typeof CUSTOMER_ACTIVITY_CATEGORY_ACTIONS
            ]]
          : [],
      );
      return orderActionsSql(actions);
    }
    return base(filter);
  };
}

const auditAction = sql<string>`case
  when ${auditLog.entity} = 'customer_addresses' and ${auditLog.operation} = 'create' then 'address_added'
  when ${auditLog.entity} = 'customer_addresses' and ${auditLog.operation} = 'delete' then 'address_removed'
  when ${auditLog.entity} = 'customer_addresses'
    and ${auditLog.operation} = 'update'
    and ${auditLog.changes} ? 'isDefault' then 'default_address_changed'
  when ${auditLog.entity} = 'customer_addresses' and ${auditLog.operation} = 'update' then 'address_updated'
  when ${auditLog.entity} = 'users'
    and ${auditLog.changes} ?| array['addressLine', 'addressUnit', 'city', 'postalCode', 'province', 'addressTagId', 'deliveryStrategyId']
    then 'address_preferences_saved'
  when ${auditLog.entity} = 'users'
    and ${auditLog.changes} ?| array['dietaryNotes', 'allergens']
    then 'dietary_preferences_saved'
  when ${auditLog.entity} = 'users' and ${auditLog.changes} ? 'deliveryNotes' then 'delivery_notes_saved'
end`;

const auditCategory = sql<string>`case
  when ${auditAction} in (
    'address_added', 'address_removed', 'default_address_changed', 'address_updated',
    'address_preferences_saved'
  ) then 'addresses'
  else 'preferences'
end`;

function auditResolver() {
  const base = columnResolver({
    createdAt: auditLog.createdAt,
    customerName: auditCustomer.name,
    customerEmail: auditCustomer.email,
    orderPublicId: auditLog.entityPublicId,
    entityPublicId: auditLog.entityPublicId,
  });

  return (filter: FilterCondition) => {
    if (filter.field === "action") return inArray(auditAction, valuesOf(filter));
    if (filter.field === "category") return inArray(auditCategory, valuesOf(filter));
    if (filter.field === "details") {
      return sql`${auditLog.changes}::text ilike ${filter.value as string}`;
    }
    return base(filter);
  };
}

function hasAnyKey(changes: Changes, fields: readonly string[]): boolean {
  return changes != null && fields.some((field) => field in changes);
}

function auditActionFor(
  entity: string,
  operation: AuditOperation,
  changes: Changes,
): CustomerActivityAction {
  if (entity === "customer_addresses") {
    if (operation === "create") return "address_added";
    if (operation === "delete") return "address_removed";
    if (operation === "update" && changes && "isDefault" in changes) {
      return "default_address_changed";
    }
    return "address_updated";
  }
  if (hasAnyKey(changes, ADDRESS_FIELDS)) return "address_preferences_saved";
  if (hasAnyKey(changes, PREFERENCE_FIELDS)) return "dietary_preferences_saved";
  return "delivery_notes_saved";
}

function valueAfter(value: unknown): unknown {
  if (value && typeof value === "object" && "to" in value) {
    return (value as { to: unknown }).to;
  }
  return value;
}

function text(value: unknown): string | null {
  const after = valueAfter(value);
  if (after == null || after === "") return null;
  if (Array.isArray(after)) return after.map(String).join(", ");
  if (typeof after === "object") return null;
  return String(after);
}

function auditDetails(
  action: CustomerActivityAction,
  changes: Changes,
  addressLabel: string | null,
): string | null {
  if (action === "address_removed") return addressLabel;
  if (action === "default_address_changed") {
    return addressLabel ? `${addressLabel} is now the default` : "New default selected";
  }
  if (action === "address_added" || action === "address_updated") {
    const label = text(changes?.label) ?? addressLabel;
    const location = [text(changes?.addressLine), text(changes?.city)].filter(Boolean).join(", ");
    return [label, location].filter(Boolean).join(" · ") || null;
  }

  const labels: Record<string, string> = {
    addressLine: "Address",
    addressUnit: "Unit",
    city: "City",
    postalCode: "Postal code",
    province: "Province",
    addressTagId: "Address tag",
    deliveryStrategyId: "Delivery strategy",
    dietaryNotes: "Dietary notes",
    allergens: "Allergen tags",
    deliveryNotes: "Delivery notes",
  };
  const changed = Object.keys(changes ?? {})
    .filter((field) => field in labels)
    .map((field) => labels[field]);
  return changed.length ? `${changed.join(", ")} updated` : null;
}

/**
 * Saved changes to a customer's account, plans and deliveries, whoever made them
 * (the customer, staff, or the system); `by` says which. The two persistent sources are merged after each
 * source applies the same filters and ordering; taking offset + size from both
 * is sufficient to produce the correct global page.
 */
export async function listCustomerActivitiesPage(
  condition: Condition | undefined,
  page: PageRequest,
  sort: SortState<CustomerActivitySortColumn> = { column: "time", dir: "desc" },
): Promise<Page<CustomerActivityListRow>> {
  const orderWhere = and(
    eq(orderCustomer.role, "user"),
    or(inArray(orderActivities.type, ORDER_TYPES), addressNote),
    conditionToSql(condition, orderResolver()),
  );
  const auditWhere = and(
    eq(auditCustomer.role, "user"),
    or(
      and(
        eq(auditLog.entity, "customer_addresses"),
        inArray(auditLog.operation, ["create", "update", "delete"]),
      ),
      and(
        eq(auditLog.entity, "users"),
        eq(auditLog.operation, "update"),
        sql`${auditLog.changes} ?| array[${sql.join(
          RELEVANT_USER_FIELDS.map((field) => sql`${field}`),
          sql`, `,
        )}]::text[]`,
      ),
    ),
    conditionToSql(condition, auditResolver()),
  );
  const orderBy = sort.dir === "asc" ? asc : desc;
  const take = (page.page + 1) * page.size;

  const [orderRows, auditRows, [{ count: orderCount }], [{ count: auditCount }]] =
    await Promise.all([
      db
        .select({
          publicId: orderActivities.publicId,
          type: orderActivities.type,
          note: orderActivities.note,
          fromStatus: orderActivities.fromStatus,
          toStatus: orderActivities.toStatus,
          createdAt: orderActivities.createdAt,
          customerName: orders.fullName,
          customerEmail: orderCustomer.email,
          customerPublicId: orderCustomer.publicId,
          customerId: orderCustomer.id,
          actorId: orderActor.id,
          actorName: orderActor.name,
          actorEmail: orderActor.email,
          orderPublicId: orders.publicId,
          orderDeploymentId: orders.deploymentId,
        })
        .from(orderActivities)
        .innerJoin(orders, eq(orders.id, orderActivities.orderId))
        .innerJoin(orderCustomer, eq(orderCustomer.id, orders.userId))
        .leftJoin(orderActor, eq(orderActor.id, orderActivities.createdBy))
        .where(orderWhere)
        .orderBy(orderBy(orderActivities.createdAt))
        .limit(take),
      db
        .select({
          publicId: auditLog.publicId,
          entity: auditLog.entity,
          entityPublicId: auditLog.entityPublicId,
          operation: auditLog.operation,
          changes: auditLog.changes,
          createdAt: auditLog.createdAt,
          customerName: auditCustomer.name,
          customerEmail: auditCustomer.email,
          customerPublicId: auditCustomer.publicId,
          customerId: auditCustomer.id,
          actorId: auditActor.id,
          actorName: auditActor.name,
          actorEmail: auditActor.email,
        })
        .from(auditLog)
        .leftJoin(customerAddresses, and(eq(auditLog.entity, "customer_addresses"), eq(customerAddresses.publicId, auditLog.entityPublicId)))
        .innerJoin(auditCustomer, or(
          and(eq(auditLog.entity, "users"), eq(auditCustomer.publicId, auditLog.entityPublicId)),
          eq(auditCustomer.id, customerAddresses.userId),
        ))
        .leftJoin(auditActor, eq(auditActor.id, auditLog.createdBy))
        .where(auditWhere)
        .orderBy(orderBy(auditLog.createdAt))
        .limit(take),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(orderActivities)
        .innerJoin(orders, eq(orders.id, orderActivities.orderId))
        .innerJoin(orderCustomer, eq(orderCustomer.id, orders.userId))
        .leftJoin(orderActor, eq(orderActor.id, orderActivities.createdBy))
        .where(orderWhere),
      db
        .select({ count: sql<number>`cast(count(*) as int)` })
        .from(auditLog)
        .leftJoin(customerAddresses, and(eq(auditLog.entity, "customer_addresses"), eq(customerAddresses.publicId, auditLog.entityPublicId)))
        .innerJoin(auditCustomer, or(
          and(eq(auditLog.entity, "users"), eq(auditCustomer.publicId, auditLog.entityPublicId)),
          eq(auditCustomer.id, customerAddresses.userId),
        ))
        .leftJoin(auditActor, eq(auditActor.id, auditLog.createdBy))
        .where(auditWhere),
    ]);

  const rows: CustomerActivityListRow[] = [
    ...orderRows.map((row) => {
      const actionKey = row.type === "note" ? "delivery_address_changed" : ORDER_ACTIONS[row.type as keyof typeof ORDER_ACTIONS];
      const details =
        row.note ??
        (row.fromStatus && row.toStatus ? `${row.fromStatus} → ${row.toStatus}` : null);
      return {
        publicId: `order:${row.publicId}`,
        category: categoryForCustomerAction(actionKey),
        actionKey,
        action: CUSTOMER_ACTIVITY_ACTION_LABELS[actionKey],
        details,
        createdAt: row.createdAt,
        customerName: row.customerName,
        customerEmail: row.customerEmail,
        customerPublicId: row.customerPublicId,
        by: byLabel(row.actorId, row.customerId, row.actorName, row.actorEmail),
        href: `/dashboard/orders/${row.orderPublicId}`,
        contextLabel: row.orderDeploymentId,
      };
    }),
    ...auditRows.map((row) => {
      const changes = row.changes as Changes;
      const actionKey = auditActionFor(row.entity, row.operation, changes);
      return {
        publicId: `audit:${row.publicId}`,
        category: categoryForCustomerAction(actionKey),
        actionKey,
        action: CUSTOMER_ACTIVITY_ACTION_LABELS[actionKey],
        details: auditDetails(actionKey, changes, null),
        createdAt: row.createdAt,
        customerName: row.customerName ?? row.customerEmail,
        customerEmail: row.customerEmail,
        customerPublicId: row.customerPublicId,
        by: byLabel(row.actorId, row.customerId, row.actorName, row.actorEmail),
        href: `/dashboard/customers/${row.customerPublicId}`,
        contextLabel: "Customer profile",
      };
    }),
  ].sort((a, b) => {
    const byTime = a.createdAt - b.createdAt;
    const ordered = byTime || a.publicId.localeCompare(b.publicId);
    return sort.dir === "asc" ? ordered : -ordered;
  });

  const start = page.page * page.size;
  return {
    items: rows.slice(start, start + page.size),
    page: page.page,
    size: page.size,
    total: orderCount + auditCount,
  };
}
