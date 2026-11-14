import { orgScope, type Visible } from "@/lib/tenant/org-scope";
import { ONGOING } from "@/lib/orders/status";
import { orderStatusIn } from "@/lib/orders/status-sql";
import type { Condition, FilterCondition } from "@foundry/commons/model/condition";
import { conditionToSql, columnResolver } from "@foundry/database";
import { and, eq, gt, ilike, inArray, isNotNull, isNull, ne, or, sql, type SQL } from "drizzle-orm";
import { UNASSIGNED_OWNER } from "@/lib/list/presets";
import { epochBoundsWhere } from "@/lib/list/default-month";
import { hasMissedDeliveries } from "@/lib/orders/missed-where";
import { PENDING } from "@/lib/payments/status";
import { paymentStatusIn } from "@/lib/payments/status-sql";
import { db } from "@/db/client";
import { deliveries, deliveryZones, deliveryFrequencies, mealSizes, orderActivities, orders, payments, plans, users } from "@/db/schema";

/** An order's last tiffin: its latest non-cancelled delivery row (the same rule `reservedEndDatesExclusive` uses). */
export const lastTiffinSql = sql<string | null>`(select max(${deliveries.deliveryDate}) from ${deliveries} where ${deliveries.orderId} = ${orders.id} and ${deliveries.status} <> 'cancelled')`;

// One rule for "renewed", shared by the renewal reminder, the Orders renewal-rate card and Renewals:
// any later plan by the same customer counts, unpaid and waitlisted included, so staff chase the
// payment instead of selling the customer a second plan. Cancelled never counts.
// "Later" means it starts after this plan AND runs at least as long: a parallel plan that ends first
// (two plans booked side by side) is not a renewal. A plan with no tiffins yet still counts.
const laterOrderWhere = sql`next_order.user_id = ${orders.userId} and next_order.id <> ${orders.id} and next_order.status in ('pending', 'waitlisted', 'active', 'paused', 'completed') and next_order.start_date > ${orders.startDate} and coalesce((select max(nd.delivery_date) from ${deliveries} as nd where nd.order_id = next_order.id and nd.status <> 'cancelled'), '9999-12-31') >= coalesce(${lastTiffinSql}, '0001-01-01')`;
const laterOrder = (extra?: SQL) => sql`exists (select 1 from ${orders} as next_order where ${laterOrderWhere}${extra ? sql` and ${extra}` : sql``})`;

/** The customer already has a later plan (any start date, unpaid and waitlisted included). */
export const laterOrderSql = sql<boolean>`${laterOrder()}`;

/** Trial conversion: a later plan that is not itself a trial. */
export const laterPaidOrderSql = sql<boolean>`${laterOrder(sql`next_order.trial_length is null`)}`;

const laterBookedAt = (extra?: SQL) => sql<number | null>`(select min(next_order.created_at) from ${orders} as next_order where ${laterOrderWhere}${extra ? sql` and ${extra}` : sql``})`;

/** When the first plan counted by `laterOrderSql` was booked (epoch ms), or null. */
export const laterOrderBookedAtSql = laterBookedAt();

/** When the first plan counted by `laterPaidOrderSql` was booked (epoch ms), or null. */
export const laterPaidOrderBookedAtSql = laterBookedAt(sql`next_order.trial_length is null`);

/** `laterOrderBookedAtSql`, or `laterPaidOrderBookedAtSql` when `paidPlansOnly` (trial-conversion rule). */
export const laterBookedAtFor = (paidPlansOnly: boolean) => laterBookedAt(paidPlansOnly ? sql`next_order.trial_length is null` : undefined);

// Max, not min: a staff status holds until a plan is booked after it, not until the first later plan.
const latestLaterBookedAt = (extra?: SQL) => sql<number | null>`(select max(next_order.created_at) from ${orders} as next_order where ${laterOrderWhere}${extra ? sql` and ${extra}` : sql``})`;

/** `laterBookedAtFor`, but the newest booking counted by it. */
export const laterBookedAtLatestFor = (paidPlansOnly: boolean) => latestLaterBookedAt(paidPlansOnly ? sql`next_order.trial_length is null` : undefined);

export type RenewalStatus = "renewed" | "unpaid" | "waitlisted" | "none";

/**
 * Where the renewal stands, best later plan first: one running, finished or paid wins over an
 * unpaid one, which wins over a waitlisted one. `paidPlansOnly` ignores later trials (Trial conversion).
 */
export function renewalStatusSql(paidPlansOnly = false) {
  const plan = (extra: SQL) => laterOrder(paidPlansOnly ? sql`next_order.trial_length is null and ${extra}` : extra);
  const paid = sql`exists (select 1 from ${payments} as np where np.order_id = next_order.id and np.status in ('paid', 'simulated_paid'))`;
  return sql<RenewalStatus>`case
    when ${plan(sql`(next_order.status in ('active', 'paused', 'completed') or ${paid})`)} then 'renewed'
    when ${plan(sql`next_order.status = 'pending'`)} then 'unpaid'
    when ${plan(sql`next_order.status = 'waitlisted'`)} then 'waitlisted'
    else 'none' end`;
}

/** Orders in the organizations a session may see (`resolveSessionVisibleOrgIds`, lib/auth/visible-orgs). */

/** Orders the badge reads as Payment review: same rule as `orderDisplayStatus`, over every payment row. */
export function paymentReviewWhere() {
  return and(
    orderStatusIn(ONGOING),
    sql`exists (select 1 from ${payments} where ${payments.orderId} = ${orders.id} and ${payments.addonRequest} is null and ${paymentStatusIn(PENDING)})`,
  );
}

async function countVisibleOrders(where: SQL | undefined, visible: Visible): Promise<number> {
  if (visible !== "all" && visible.length === 0) return 0;
  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(and(where, orgScope(orders.organizationId, visible)));
  return count;
}


/** Orders waiting on a payment claim or staff verification, for the Payment review tab badge. */
export const countPaymentReviewOrders = (visible: Visible) => countVisibleOrders(paymentReviewWhere(), visible);

/** ISO dates (app timezone), both inclusive. */
export type FreeTiffinRange = { from: string; to: string };

/**
 * Orders where staff gave free tiffins on top of the plan (`complimentary_tiffins`), cancelled ones left out.
 * With a range, only orders with a free tiffin scheduled in it: the analytics Free tiffins rule, so both agree.
 */
export const freeTiffinsWhere = (range?: FreeTiffinRange) =>
  and(
    gt(orders.complimentaryTiffins, 0),
    ne(orders.status, "cancelled"),
    range
      ? sql`exists (select 1 from ${deliveries} where ${deliveries.orderId} = ${orders.id} and ${deliveries.complimentaryNote} is not null
          and ${deliveries.status} = 'scheduled' and ${deliveries.deliveryDate} between ${range.from} and ${range.to})`
      : undefined,
  );
/** Free-tiffin orders, optionally only those created inside an epoch-ms window (the list's date picker). */
export const countFreeTiffinOrders = (visible: Visible, created?: { from?: string; to?: string }) =>
  countVisibleOrders(and(freeTiffinsWhere(), created ? epochBoundsWhere(orders.createdAt, created) : undefined), visible);

function filterValues(f: FilterCondition): string[] {
  return f.operator === "in" ? (f.value as string[]) : [String(f.value)];
}

// Plan and meal-size tier live on joined tables. The URL carries the plan key
// or tier name; a subquery resolves it so the orders list can open the rows
// behind an analytics figure without putting an internal id in the link.
function ordersListResolver() {
  const base = columnResolver({
    status: orders.status,
    fullName: orders.fullName,
    deploymentId: orders.deploymentId,
    createdAt: orders.createdAt,
    startDate: orders.startDate,
  });
  return (f: FilterCondition) => {
    if (f.field === "owner") {
      const vals = filterValues(f);
      const ids = vals.filter((v) => v !== UNASSIGNED_OWNER);
      return or(
        vals.includes(UNASSIGNED_OWNER) ? isNull(orders.currentOwner) : undefined,
        ids.length ? inArray(orders.currentOwner, db.select({ id: users.id }).from(users).where(inArray(users.publicId, ids))) : undefined,
      )!;
    }
    if (f.field === "planType") {
      const v = filterValues(f)[0];
      return v === "trial" ? isNotNull(orders.trialLength) : isNull(orders.trialLength);
    }
    if (f.field === "frequency") {
      return inArray(orders.frequencyId, db.select({ id: deliveryFrequencies.id }).from(deliveryFrequencies).where(inArray(deliveryFrequencies.key, filterValues(f))));
    }
    if (f.field === "plan") {
      return inArray(
        orders.planId,
        db.select({ id: plans.id }).from(plans).where(inArray(plans.key, filterValues(f))),
      );
    }
    if (f.field === "tier") {
      return inArray(
        orders.mealSizeId,
        db
          .select({ id: mealSizes.id })
          .from(mealSizes)
          .where(
            and(
              inArray(mealSizes.tier, filterValues(f) as ("budget" | "medium" | "premium")[]),
              eq(mealSizes.custom, false),
            ),
          ),
      );
    }
    if (f.field === "mealSize") {
      return inArray(orders.mealSizeId, db.select({ id: mealSizes.id }).from(mealSizes).where(inArray(mealSizes.key, filterValues(f))));
    }
    if (f.field === "zone") {
      return inArray(orders.zoneId, db.select({ id: deliveryZones.id }).from(deliveryZones).where(inArray(deliveryZones.name, filterValues(f))));
    }
    if (f.field === "org") return inArray(orders.organizationId, filterValues(f));
    // Orders carry no email of their own; search matches the account's.
    if (f.field === "email") {
      return inArray(
        orders.userId,
        db.select({ id: users.id }).from(users).where(ilike(users.email, String(f.value))),
      );
    }
    return base(f);
  };
}

export interface OrdersListOpts {
  lookOutOnly?: boolean;
  paymentReview?: boolean;
  freeTiffins?: boolean;
  /** Free tiffins tab: only orders with a free tiffin in this range. */
  freeRange?: FreeTiffinRange;
  /** today in the app timezone; keeps orders with a missed delivery before it. */
  missedAsOf?: string;
  /**
   * Orders cancelled inside this epoch window (by the cancel activity timestamp),
   * matching the Orders "Cancelled" KPI — not `orders.created_at`.
   */
  cancelledInRange?: { from: number; to: number };
}

const cancelledInRangeWhere = (range: { from: number; to: number }) =>
  sql`exists (
    select 1 from ${orderActivities} oa
    where oa.order_id = ${orders.id}
      and oa.type = 'cancelled'
      and oa.created_at between ${range.from} and ${range.to}
  )`;

// Shared by the Orders listing and its count. `visible` is and-ed last, so no facet can widen the scope.
export function ordersListWhere(condition: Condition | undefined, visible: Visible, opts: OrdersListOpts = {}) {
  return and(
    conditionToSql(condition, ordersListResolver()),
    opts.lookOutOnly ? isNotNull(orders.lookOutAt) : undefined,
    opts.freeTiffins ? freeTiffinsWhere(opts.freeRange) : undefined,
    opts.paymentReview ? paymentReviewWhere() : undefined,
    opts.missedAsOf ? hasMissedDeliveries(opts.missedAsOf) : undefined,
    opts.cancelledInRange ? cancelledInRangeWhere(opts.cancelledInRange) : undefined,
    orgScope(orders.organizationId, visible),
  );
}
