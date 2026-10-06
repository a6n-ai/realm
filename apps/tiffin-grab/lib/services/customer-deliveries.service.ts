import { loadExtraDates } from "@/lib/services/delivery-extras";
import { NotFoundError, Role, ValidationError, weekdayKey, zonedDateIso } from "@foundry/commons";
import type { FileDetail } from "@foundry/storage/model";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, lte, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryCategorySwaps, deliveryFrequencies, deliveryMoves, dishCategories, dishes, mealSizes, menuItems, orderActivities, orderAddons, orders, payments, plans } from "@/db/schema";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import { resolveTripDay, weekLoader } from "@/lib/menu/trip-meals";
import { coveredDates, formatCoversLabel, swapAppliesTo } from "@/lib/menu/coverage";
import type { ExchangeOverride } from "@/lib/menu/swap-rules";
import { orderDeliveryDays, type DayOfWeek } from "@/lib/menu/delivery-days";
import {
  resolveDeliveryMeal,
  resolveDeliveryMealsForWeek,
  resolvedMealsWeekKey,
  type ResolvedCategory,
} from "@/lib/menu/resolve-delivery-meal";
import { allowedDishIdsForMealSize } from "@/lib/menu/selections.service";
import { isHiddenFromCustomer, orderDisplayStatus } from "@/lib/orders/display-status";
import { getSession } from "@/lib/auth/session";
import { isPaymentReviewStatus } from "@/lib/orders/display-status";
import { dishCategoriesService } from "./dish-categories.service";
import { menuService } from "./menu.service";
import { autoResumeIfElapsed } from "./orders.service";
import { toDropOffValues } from "./address-drop-off.service";
import type { DropOffValue } from "@/lib/catalog/drop-off";
import { earliestNewPlanStart } from "./order-window";
import { getAppSettings } from "./app-settings.service";
import { getPauseLimits, getPauseUsage } from "./pause-limits.service";
import { currentUserId } from "./session-service";
import { deliveredTiffinCount, type DeliveryForCounts } from "./tiffin-counts";
import { mealSizeServesWeekends } from "./weekend-dish";

// Staff (admin or member) may manage ANY customer's order/delivery; a plain customer may manage
// only their own. Centralizes the "owner OR staff" rule so both the /me and /dashboard surfaces
// share one authorization policy (feature-flagged refinements can layer on later).
const STAFF_ROLES = new Set<string>([Role.ADMIN, Role.MEMBER]);

async function callerIsStaff(): Promise<boolean> {
  const session = await getSession();
  return session != null && STAFF_ROLES.has(session.user.role);
}

// Passes if the caller is staff, or owns the order. Not-owned and not-existent both throw the same
// NotFoundError — no existence oracle for another customer's data.
export async function assertCanManageOrder(orderPublicId: string): Promise<void> {
  if (await callerIsStaff()) return;
  const userId = await currentUserId();
  if (userId == null) throw new NotFoundError("Subscription not found");
  await assertOwnsOrder(userId, orderPublicId);
}

// Passes if the caller is staff, or owns the delivery's order.
export async function assertCanManageDelivery(deliveryPublicId: string): Promise<void> {
  if (await callerIsStaff()) return;
  const userId = await currentUserId();
  if (userId == null) throw new NotFoundError("Delivery not found");
  await assertOwnsDelivery(userId, deliveryPublicId);
}

// True while any payment on the order is unconfirmed (awaiting, under review, or rejected and
// awaiting a re-claim). Used to freeze customer schedule changes until staff approve.
export async function orderPaymentLocked(orderPublicId: string): Promise<boolean> {
  const rows = await db
    .select({ status: payments.status })
    .from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId))
    .where(eq(orders.publicId, orderPublicId));
  return rows.some((r) => isPaymentReviewStatus(r.status) || r.status === "rejected");
}

// A customer's plan is read-only until payment is confirmed (meal picks included); staff can always act.
export async function assertOrderUnlocked(orderPublicId: string): Promise<void> {
  if (await callerIsStaff()) return;
  if (await orderPaymentLocked(orderPublicId)) {
    throw new ValidationError("You can edit your plan once we confirm your payment.");
  }
}

type Delivery = typeof deliveries.$inferSelect;
export type CustomerDelivery = Delivery & { orderPublicId: string; planName: string; isMakeup: boolean; dropOff?: DropOffValue };
export type Subscription = {
  publicId: string;
  planName: string;
  planType: "tiffin" | "healthy";
  planKey: string;
  status: string;
  /** Shared tag vocabulary: Active / Payment review / Completed (Rejected never reaches /me). */
  displayStatus: string;
  fullName: string;
  addressLine: string;
  city: string;
  postalCode: string;
  zoneId: bigint | null;
  mealSizeId: bigint;
  mealSizeName: string;
  /** A per-customer custom meal: its name is the composition ("1 Rice + 8 Roti + …"). */
  mealSizeCustom?: boolean;
  /** A trial order: dishes can be edited, and the plan cannot be paused or moved. */
  trial?: boolean;
  /** Add-ons on the order, each riding in every tiffin. */
  addons?: { name: string; qty: number }[];
  persons: number;
  /** Per-category item counts from the meal size at checkout (e.g. sabzi: 2). */
  categoryCounts: Record<string, number>;
  /** Admin-set plan tag (same colour as dish plan chips). */
  tagLabel?: string | null;
  tagColor?: string | null;
  frequencyKey?: string;
  /** The plan's place type and strategies, as still offered. */
  dropOff?: DropOffValue;
};

const VISIBLE = ["scheduled", "paused", "skipped"] as const;

async function paymentStatusesByOrderId(orderIds: bigint[]): Promise<Map<bigint, string[]>> {
  const map = new Map<bigint, string[]>();
  if (orderIds.length === 0) return map;
  const rows = await db
    .select({ orderId: payments.orderId, status: payments.status })
    .from(payments)
    .where(inArray(payments.orderId, orderIds));
  for (const r of rows) {
    const list = map.get(r.orderId) ?? [];
    list.push(r.status);
    map.set(r.orderId, list);
  }
  return map;
}

export async function myActiveSubscriptions(userId: bigint): Promise<Subscription[]> {
  // Flip any elapsed pause window back to "active" before reporting status — otherwise a
  // customer whose pause silently expired keeps seeing "paused" until some other write touches
  // the order.
  const pausedOrderIds = await db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, "paused")));
  await Promise.all(pausedOrderIds.map((o) => autoResumeIfElapsed(o.id)));

  const rows = await db
    .select({
      id: orders.id,
      publicId: orders.publicId,
      planName: plans.name,
      planType: plans.planType,
      planKey: plans.key,
      status: orders.status,
      fullName: orders.fullName,
      addressLine: orders.addressLine,
      city: orders.city,
      postalCode: orders.postalCode,
      zoneId: orders.zoneId,
      mealSizeId: orders.mealSizeId,
      mealSizeName: mealSizes.name,
      mealSizeCustom: mealSizes.custom,
      trialLength: orders.trialLength,
      persons: orders.persons,
      categoryCounts: orders.categoryCounts,
      tagLabel: plans.tagLabel,
      tagColor: plans.tagColor,
      frequencyKey: deliveryFrequencies.key,
      deliveryStrategyIds: orders.deliveryStrategyIds,
      deliveryTagId: orders.deliveryTagId,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .where(and(eq(orders.userId, userId), inArray(orders.status, ["active", "paused"])));
  const dropOffs = await toDropOffValues(rows.map((r) => ({ tagId: r.deliveryTagId, strategyIds: r.deliveryStrategyIds })));

  const payByOrder = await paymentStatusesByOrderId(rows.map((r) => r.id));
  const addonRows = rows.length
    ? await db.select({ orderId: orderAddons.orderId, name: orderAddons.addonName, qty: orderAddons.qty }).from(orderAddons)
      .where(inArray(orderAddons.orderId, rows.map((r) => r.id))).orderBy(asc(orderAddons.id))
    : [];
  return rows
    .filter((r) => !isHiddenFromCustomer(payByOrder.get(r.id) ?? []))
    .map((r) => {
      const paymentStatuses = payByOrder.get(r.id) ?? [];
      return {
        publicId: r.publicId,
        planName: r.planName,
        planType: r.planType,
        planKey: r.planKey,
        status: r.status,
        displayStatus: orderDisplayStatus(r.status, paymentStatuses),
        fullName: r.fullName,
        addressLine: r.addressLine,
        city: r.city,
        postalCode: r.postalCode,
        zoneId: r.zoneId,
        mealSizeId: r.mealSizeId,
        mealSizeName: r.mealSizeName,
        mealSizeCustom: r.mealSizeCustom,
        trial: r.trialLength != null,
        addons: addonRows.filter((a) => a.orderId === r.id).map(({ name, qty }) => ({ name, qty })),
        persons: r.persons,
        categoryCounts: (r.categoryCounts as Record<string, number> | null) ?? {},
        tagLabel: r.tagLabel,
        tagColor: r.tagColor,
        frequencyKey: r.frequencyKey,
        dropOff: dropOffs[rows.indexOf(r)],
      };
    });
}

/**
 * The customer's default plan. Prefer `active` over `paused`; among several (sequential plans),
 * the one that delivers next, and only when nothing is left to deliver the newest by createdAt.
 */
export async function myPrimarySubscription(userId: bigint): Promise<Subscription | null> {
  const all = await myActiveSubscriptions(userId);
  if (all.length === 0) return null;
  const active = all.filter((s) => s.status === "active");
  const pool = active.length > 0 ? active : all;
  if (pool.length === 1) return pool[0]!;
  const ids = pool.map((s) => s.publicId);
  // Sequential plans are allowed, so the newest plan is often the one that has not started yet.
  // The default is the plan that delivers next; only when nothing is left to deliver do we fall
  // back to the newest (myActiveSubscriptions has no createdAt, hence the re-query).
  const { timezone } = await getAppSettings();
  const today = zonedDateIso(Date.now(), timezone);
  const upcoming = await db
    .select({ publicId: orders.publicId, next: sql<string>`min(${deliveries.deliveryDate})` })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(and(inArray(orders.publicId, ids), inArray(deliveries.status, [...VISIBLE]), gte(deliveries.deliveryDate, today)))
    .groupBy(orders.publicId)
    .orderBy(asc(sql`min(${deliveries.deliveryDate})`), desc(sql`max(${orders.createdAt})`))
    .limit(1);
  const nextUp = pool.find((s) => s.publicId === upcoming[0]?.publicId);
  if (nextUp) return nextUp;
  const [newest] = await db
    .select({ publicId: orders.publicId })
    .from(orders)
    .where(inArray(orders.publicId, ids))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return pool.find((s) => s.publicId === newest?.publicId) ?? pool[0]!;
}

/** First, last and next (>= today) delivery date of each of the customer's plans, keyed by order publicId. */
export type SubscriptionWindow = { first: string; last: string; next: string | null };

export async function mySubscriptionWindows(userId: bigint, today: string): Promise<Record<string, SubscriptionWindow>> {
  const rows = await db
    .select({
      publicId: orders.publicId,
      first: sql<string>`min(${deliveries.deliveryDate})`,
      last: sql<string>`max(${deliveries.deliveryDate})`,
      next: sql<string | null>`min(${deliveries.deliveryDate}) filter (where ${deliveries.deliveryDate} >= ${today})`,
    })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(and(eq(orders.userId, userId), inArray(deliveries.status, [...VISIBLE])))
    .groupBy(orders.publicId);
  return Object.fromEntries(rows.map((r) => [r.publicId, { first: String(r.first), last: String(r.last), next: r.next == null ? null : String(r.next) }]));
}

/** One entry per (plan, EATING day). `truck` marks the eating day the delivery arrives on. */
export type AgendaDay = {
  orderId: string;
  status: "scheduled" | "paused" | "skipped" | "cancelled";
  cutoffAt: number;
  deliveryDate: string;
  truck: boolean;
  /** Only on the truck day: tiffins and eating days the trip feeds. */
  units: number;
  covers: string[];
  /** This date used to be its own trip, now merged into this one — render as "moved", not the trip's live status. */
  moved?: boolean;
  optimoCompletionStatus?: string | null;
  /** The delivery row's public id (what OptimoRoute knows the stop as). */
  deliveryId?: string;
};

/**
 * Light agenda for the week strip: one query, no meals/menus. Keyed by EATING day (a trip fans out to each
 * covered day); merged-source rows are skipped because their day already sits in the target trip's covers.
 */
export async function myAgendaDots(userId: bigint, from: string, until: string): Promise<Record<string, AgendaDay[]>> {
  const rows = await db
    .select({ d: deliveries, orderId: orders.publicId })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(and(eq(orders.userId, userId), inArray(deliveries.status, [...VISIBLE]), gte(deliveries.deliveryDate, from), lte(deliveries.deliveryDate, until)))
    .orderBy(asc(deliveries.deliveryDate));
  const out: Record<string, AgendaDay[]> = {};
  const extrasById = await loadExtraDates(db, rows.map((r) => r.d.id));
  // A whole-trip reschedule leaves the old row skipped and inserts a makeup.
  // The old day is no longer a delivery, so it must not keep a status dot.
  const replacedByMakeup = new Set(
    rows.flatMap(({ d }) => (d.makeupForDeliveryId == null ? [] : [d.makeupForDeliveryId.toString()])),
  );
  // A merged source's OWN date is now moved: mark it on the target's dot instead of showing the target's live status there.
  const movedDatesByTarget = new Map<string, Set<string>>();
  for (const { d } of rows) {
    if (d.mergedIntoDeliveryId == null) continue;
    const key = d.mergedIntoDeliveryId.toString();
    const set = movedDatesByTarget.get(key) ?? movedDatesByTarget.set(key, new Set()).get(key)!;
    for (const date of coveredDates(d)) set.add(date);
  }
  for (const { d, orderId } of rows) {
    if (d.mergedIntoDeliveryId != null || replacedByMakeup.has(d.id.toString())) continue;
    const covers = coveredDates(d);
    const moved = movedDatesByTarget.get(d.id.toString());
    for (const date of covers) {
      (out[date] ??= []).push({ orderId, status: d.status as AgendaDay["status"], cutoffAt: Number(d.cutoffAt), deliveryDate: d.deliveryDate, truck: date === d.deliveryDate, units: d.tiffinUnits, covers, moved: moved?.has(date), optimoCompletionStatus: d.optimoCompletionStatus, deliveryId: d.publicId });
    }
    // A doubled day (moved tiffin landed on an eating day) gets a second dot.
    for (const date of extrasById.get(d.id) ?? []) {
      (out[date] ??= []).push({ orderId, status: d.status as AgendaDay["status"], cutoffAt: Number(d.cutoffAt), deliveryDate: d.deliveryDate, truck: false, units: d.tiffinUnits, covers, moved: true, optimoCompletionStatus: d.optimoCompletionStatus, deliveryId: d.publicId });
    }
    // The eat dates stayed put and the truck moved: mark the arrival day, or that Friday looks empty.
    if (d.status === "scheduled" && !covers.includes(d.deliveryDate)) {
      (out[d.deliveryDate] ??= []).push({ orderId, status: "scheduled", cutoffAt: Number(d.cutoffAt), deliveryDate: d.deliveryDate, truck: true, units: d.tiffinUnits, covers, optimoCompletionStatus: d.optimoCompletionStatus, deliveryId: d.publicId });
    }
  }
  // A moved tiffin eats on its new day now; its old day keeps a "moved" dot unless another tiffin still eats there.
  const byId = new Map(rows.map((r) => [r.d.id, r]));
  const moves = rows.length === 0 ? [] : await db.select({ fromId: deliveryMoves.fromDeliveryId, toId: deliveryMoves.toDeliveryId, from: deliveryMoves.fromEatDate })
    .from(deliveryMoves).where(inArray(deliveryMoves.fromDeliveryId, rows.map((r) => r.d.id)));
  for (const m of moves) {
    const src = byId.get(m.fromId!)!;
    if (!m.from || m.from < from || m.from > until || out[m.from]?.some((x) => x.orderId === src.orderId)) continue;
    const t = byId.get(m.toId)?.d ?? src.d;
    out[m.from] = [{ orderId: src.orderId, status: t.status as AgendaDay["status"], cutoffAt: Number(t.cutoffAt), deliveryDate: t.deliveryDate, truck: false, units: t.tiffinUnits, covers: coveredDates(t), moved: true, optimoCompletionStatus: t.optimoCompletionStatus, deliveryId: t.publicId }];
  }
  return out;
}

export async function hasLiveSubscription(userId: bigint): Promise<boolean> {
  return (await myPrimarySubscription(userId)) != null;
}

// Scoped to orders.userId = userId: a customer only ever sees their own delivery
// rows here, across every subscription they own. Cancelled deliveries are
// filtered by delivery status, not order status — cancelOrder() marks every
// affected row cancelled directly, so no separate orders.status check is needed.
export async function myDeliveries(userId: bigint, from: string, until: string): Promise<CustomerDelivery[]> {
  const rows = await db
    .select({ d: deliveries, orderPublicId: orders.publicId, planName: plans.name })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(
      and(
        eq(orders.userId, userId),
        inArray(deliveries.status, [...VISIBLE]),
        gte(deliveries.deliveryDate, from),
        lte(deliveries.deliveryDate, until),
      ),
    )
    .orderBy(asc(deliveries.deliveryDate));
  const dropOffs = await toDropOffValues(rows.map((r) => ({ tagId: r.d.deliveryTagId, strategyIds: r.d.deliveryStrategyIds })));
  return rows.map((r, i) => ({
    ...r.d,
    orderPublicId: r.orderPublicId,
    planName: r.planName,
    isMakeup: r.d.makeupForDeliveryId !== null,
    // The delivery's own drop-off; only meaningful when re-addressed (then no tag = none).
    dropOff: dropOffs[i],
  }));
}

// One row per subscription: the earliest still-scheduled delivery. `myDeliveries`
// already returns deliveryDate ASC, so the first "scheduled" row seen per
// orderPublicId is the next one — paused/skipped rows are excluded here even
// though myDeliveries surfaces them (VISIBLE) for other callers.
export async function nextDeliveryByOrder(userId: bigint, from: string): Promise<Map<string, CustomerDelivery>> {
  const farFuture = "9999-12-31";
  const rows = await myDeliveries(userId, from, farFuture);
  const next = new Map<string, CustomerDelivery>();
  for (const row of rows) {
    if (row.status !== "scheduled") continue;
    if (!next.has(row.orderPublicId)) next.set(row.orderPublicId, row);
  }
  return next;
}

// Ownership guards: called by customer server actions BEFORE delegating to
// shared admin mutations that have no ownership check of their own. Not-owned
// and not-existent both throw the same NotFoundError — never a distinct
// forbidden error, so there is no existence oracle for another user's data.
export async function assertOwnsDelivery(userId: bigint, deliveryPublicId: string): Promise<void> {
  const [row] = await db
    .select({ ownerId: orders.userId })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .where(eq(deliveries.publicId, deliveryPublicId))
    .limit(1);
  if (!row || row.ownerId !== userId) throw new NotFoundError("Delivery not found");
}

export async function assertOwnsOrder(userId: bigint, orderPublicId: string): Promise<void> {
  const [row] = await db
    .select({ ownerId: orders.userId })
    .from(orders)
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!row || row.ownerId !== userId) throw new NotFoundError("Subscription not found");
}

export type TiffinCounts = {
  /** tiffinCount snapshot from checkout — persons × delivery days over the plan. */
  total: number;
  /** Days past cutoff that stayed scheduled (incl. make-ups), × persons. */
  delivered: number;
  /** total − delivered: future scheduled days and tiffins not yet delivered (failed, not moved). */
  remaining: number;
  /** Tiffins per delivery day = persons. */
  persons: number;
  /** Latest delivery_date on any row. */
  lastDeliveryDate: string | null;
  /** Weekday keys (e.g. ["mon","wed","fri"]) the plan delivers on. */
  deliveryWeekdays: string[];
  /** Weekdays the customer eats; null for legacy plans (every day the plan delivers or carries). */
  eatingWeekdays?: string[] | null;
  /** False when the meal has no weekend dish: Sat/Sun can't be eating days. */
  servesWeekends?: boolean;
};

// Delivered/remaining tiffins for one subscription, plus the plan's last delivery date and
// weekdays (the move sheet's range). Delivered is derived from the order's delivery rows via the
// pure tiffin-counts helper.
//
// AUTH-FREE core: callers MUST have already gated (assertCanManageOrder for /me, requireStaff for
// /dashboard). Use myTiffinCounts from customer code — it adds the ownership check.
export async function orderTiffinCounts(orderPublicId: string): Promise<TiffinCounts> {
  const [order] = await db
    .select({
      id: orders.id,
      mealSizeId: orders.mealSizeId,
      tiffinCount: orders.tiffinCount,
      persons: orders.persons,
      includeSaturday: orders.includeSaturday,
      includeSunday: orders.includeSunday,
      eatingDays: orders.eatingDays,
      frequencyKey: deliveryFrequencies.key,
      weekdays: deliveryFrequencies.weekdays,
    })
    .from(orders)
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!order) throw new NotFoundError("Subscription not found");

  const rows = await db
    .select({
      id: deliveries.id,
      status: deliveries.status,
      cutoffAt: deliveries.cutoffAt,
      makeupForDeliveryId: deliveries.makeupForDeliveryId,
      pooledAt: deliveries.pooledAt,
      mergedIntoDeliveryId: deliveries.mergedIntoDeliveryId,
      deliveryDate: deliveries.deliveryDate,
      tiffinUnits: deliveries.tiffinUnits,
      optimoCompletionStatus: deliveries.optimoCompletionStatus,
    })
    .from(deliveries)
    .where(eq(deliveries.orderId, order.id));

  const delivered = deliveredTiffinCount(rows as DeliveryForCounts[], Date.now());
  const lastDeliveryDate = rows.reduce<string | null>(
    (max, r) => (max == null || r.deliveryDate > max ? r.deliveryDate : max),
    null,
  );
  const deliveryWeekdays = orderDeliveryDays({
    frequencyKey: order.frequencyKey,
    weekdays: order.weekdays as DayOfWeek[] | null,
    includeSaturday: !order.eatingDays?.length && order.includeSaturday,
    includeSunday: !order.eatingDays?.length && order.includeSunday,
  }).filter((d) => d !== "sat" && d !== "sun");

  return {
    total: order.tiffinCount,
    delivered,
    remaining: order.tiffinCount - delivered,
    persons: order.persons,
    lastDeliveryDate,
    deliveryWeekdays,
    eatingWeekdays: order.eatingDays?.length ? (order.eatingDays as string[]) : null,
    servesWeekends: await mealSizeServesWeekends(order.mealSizeId),
  };
}

// Ownership-checked counts for the customer header. Staff read via orderTiffinCounts directly
// (the dashboard page already gates with requireStaff).
export async function myTiffinCounts(userId: bigint, orderPublicId: string): Promise<TiffinCounts> {
  await assertOwnsOrder(userId, orderPublicId); // IDOR gate — before the read
  return orderTiffinCounts(orderPublicId);
}

// The earliest start date a NEW plan may use without overlapping this customer's
// currently active/paused subscriptions — the same reserved-band logic createCheckout's
// server-side overlap guard enforces (see reservedEndDatesExclusive in order-window.ts),
// surfaced here so /me/renew's date picker can float its minimum past it instead of only
// discovering the conflict after the customer fills out the whole form and submits.
// Returns null when the customer has no active/paused orders (no constraint to apply).
export async function myEarliestNewPlanStartDate(userId: bigint): Promise<string | null> {
  return earliestNewPlanStart(db, userId);
}

/** Original delivery id -> the day its tiffin moved to (the picked eat day for a single-day trip, else the make-up's delivery date). */
export async function makeupSourceIdsForOrder(orderPublicId: string): Promise<Map<string, string>> {
  const [order] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!order) return new Map();
  const rows = await db
    .select({ src: deliveries.makeupForDeliveryId, deliveryDate: deliveries.deliveryDate, coversDates: deliveries.coversDates })
    .from(deliveries)
    .where(and(eq(deliveries.orderId, order.id), isNotNull(deliveries.makeupForDeliveryId)));
  return new Map(rows.map((r) => [r.src!.toString(), r.coversDates?.length === 1 ? r.coversDates[0]! : r.deliveryDate]));
}

// Pause budget for the customer's pause UI: limits (nullable = unlimited) and
// current usage, so the panel can show "N of M pauses used" before submit.
export async function myPausePanel(userId: bigint, orderPublicId: string) {
  await assertOwnsOrder(userId, orderPublicId); // IDOR gate — before the read
  const [row] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!row) throw new NotFoundError("Subscription not found");
  const [limits, usage] = await Promise.all([getPauseLimits(row.id), getPauseUsage(row.id)]);
  return { limits, usage };
}

export type WaitlistedSubscription = {
  publicId: string; planName: string; mealSizeName: string;
  daysPerWeek: number; status: "waitlisted" | "pending";
  fullName: string; addressLine: string; city: string; postalCode: string;
};

// Waitlisted/pending orders have NO materialized deliveries, so they are absent
// from myActiveSubscriptions (active/paused only). Surfaced separately so the
// logged-in customer sees their pending order instead of a blank "no orders".
export async function myWaitlistedSubscriptions(userId: bigint): Promise<WaitlistedSubscription[]> {
  const rows = await db
    .select({
      publicId: orders.publicId, planName: plans.name, mealSizeName: mealSizes.name,
      daysPerWeek: deliveryFrequencies.daysPerWeek, status: orders.status,
      fullName: orders.fullName, addressLine: orders.addressLine, city: orders.city, postalCode: orders.postalCode,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .where(and(eq(orders.userId, userId), inArray(orders.status, ["waitlisted", "pending"])));
  return rows.map((r) => ({ ...r, status: r.status as "waitlisted" | "pending" }));
}

// Past deliveries for the History section. Bounded lookback [since, before);
// `before` is today (exclusive) so it never overlaps the forward myDeliveries window.
export async function myDeliveryHistory(userId: bigint, since: string, before: string): Promise<CustomerDelivery[]> {
  const rows = await db
    .select({ d: deliveries, orderPublicId: orders.publicId, planName: plans.name })
    .from(deliveries)
    .innerJoin(orders, eq(deliveries.orderId, orders.id))
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(and(
      eq(orders.userId, userId),
      inArray(deliveries.status, [...VISIBLE]),
      gte(deliveries.deliveryDate, since),
      lt(deliveries.deliveryDate, before),
    ))
    .orderBy(desc(deliveries.deliveryDate));
  return rows.map((r) => ({ ...r.d, orderPublicId: r.orderPublicId, planName: r.planName, isMakeup: r.d.makeupForDeliveryId !== null }));
}

export type SubSummary = {
  publicId: string;
  planName: string;
  mealSizeName: string;
  daysPerWeek: number;
  status: string;
  createdAt: number;
  startDate: string;
};

// All of a customer's subscriptions across every status, newest first — for the
// "you already have" summary on /subscribe. Rejected-payment plans are omitted
// (customer starts a new order). Status is the shared display vocabulary
// (Active / Payment review / Completed), not raw DB order_status.
export async function mySubscriptionsSummary(userId: bigint): Promise<SubSummary[]> {
  const rows = await db
    .select({
      id: orders.id,
      publicId: orders.publicId,
      planName: plans.name,
      mealSizeName: mealSizes.name,
      daysPerWeek: deliveryFrequencies.daysPerWeek,
      status: orders.status,
      createdAt: orders.createdAt,
      startDate: orders.startDate,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orders.createdAt));

  const payByOrder = await paymentStatusesByOrderId(rows.map((r) => r.id));
  return rows
    .filter((r) => !isHiddenFromCustomer(payByOrder.get(r.id) ?? []))
    .map((r) => ({
      publicId: r.publicId,
      planName: r.planName,
      mealSizeName: r.mealSizeName,
      daysPerWeek: r.daysPerWeek,
      status: orderDisplayStatus(r.status, payByOrder.get(r.id) ?? []),
      createdAt: r.createdAt,
      startDate: r.startDate,
    }));
}

export type CustomerActivity = {
  publicId: string;
  type: string;
  note: string | null;
  fromStatus: string | null;
  toStatus: string | null;
  deliveryId: bigint | null;
  createdAt: number;
  orderPublicId: string;
};

// Activity log scoped to the caller's own orders (IDOR via orders.userId).
export async function myDeliveryActivity(userId: bigint, limit = 50): Promise<CustomerActivity[]> {
  return db
    .select({
      publicId: orderActivities.publicId,
      type: orderActivities.type,
      note: orderActivities.note,
      fromStatus: orderActivities.fromStatus,
      toStatus: orderActivities.toStatus,
      deliveryId: orderActivities.deliveryId,
      createdAt: orderActivities.createdAt,
      orderPublicId: orders.publicId,
    })
    .from(orderActivities)
    .innerJoin(orders, eq(orderActivities.orderId, orders.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orderActivities.createdAt))
    .limit(limit);
}

// Pure read: resolves "what's coming" for one delivery against the released menu_week for its
// plan/week. Never calls reconcileMakeups/materializeDeliveries — those are write paths reached
// only through the admin/cron flows, not from a customer-facing lookup.
export async function myDeliveryMeal(d: CustomerDelivery, person = 1): Promise<ResolvedCategory[] | { pending: true }> {
  const [order] = await db
    .select({ id: orders.id, planId: orders.planId, mealSizeId: orders.mealSizeId, categoryCounts: orders.categoryCounts, planType: plans.planType })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(eq(orders.publicId, d.orderPublicId))
    .limit(1);
  if (!order) return { pending: true };

  const weekStart = mondayOfIso(d.deliveryDate);
  // Same exact released-week gate as Menu (`menuService.getReleasedWeek`) — never a parallel query.
  const week = await menuService.getReleasedWeek(weekStart);
  if (!week) return { pending: true };

  // delivery_date is a calendar date; explicit-UTC parse (the mandatory `Z`) is required to
  // derive its weekday, or local-midnight parsing shifts the day (spec-6 bug).
  const dayOfWeek = weekdayKey(new Date(`${d.deliveryDate}T00:00:00Z`));
  return resolveDeliveryMeal({ id: order.id, planId: order.planId, mealSizeId: order.mealSizeId, categoryCounts: order.categoryCounts }, { id: week.id, weekStart: week.weekStart }, dayOfWeek, person, d.id);
}

// Reuse resolveDeliveryMeal's own return shape for a single day — one implementation of
// "what a subscriber receives" (resolveCategoriesForDay), never a parallel type.
export type ResolvedMeal = ResolvedCategory[];
export type MealOption = { category: string; dishId: string; name: string; image: FileDetail | null };
/** One category swap applied to one eating day of a trip. */
export type AppliedSwap = { publicId: string; fromCategory: string; toCategory: string; qtyFrom: number; qtyTo: number; fromRow: number | null; receiveTu: number | null };
/** Per-eating-day swap state for a trip; a plain day has a single entry (its own date). */
export type EatingDaySwaps = {
  date: string;
  appliedSwaps: AppliedSwap[];
  /** Pairs the swap sheet may offer (already filtered to this meal size and plan); same for every day of the order. */
  swapPairs: { fromCategory: string; toCategory: string; exchangeOverrides?: ExchangeOverride[] }[];
};
export type CalendarDay = {
  date: string;
  status: "scheduled" | "paused" | "skipped" | "cancelled";
  locked: boolean;
  isMakeup: boolean;
  /** Released menu_week publicId; null when the delivery exists but that week's menu isn't out yet. */
  menuWeekId: string | null;
  meal: ResolvedMeal | null;
  options: MealOption[];
  /** Tiffins this trip carries (persons x covered days). */
  units?: number;
  /** Eating days the trip carries; a single entry for a plain day. */
  covers?: string[];
  /** Eating days on this trip that carry a second tiffin. */
  extras?: string[];
  /** "Covers Mon + Tue"; null for a plain day. */
  coversLabel?: string | null;
  /** Delivery date of the trip this row was merged into ("Combined into Wed's delivery"); null otherwise. */
  combinedInto?: string | null;
  /** Every tiffin left this row (merged away or replaced by a make-up): a move may land on its date again. */
  emptied?: boolean;
  /** Tiffins moved onto this trip (null from = from the pool) and off it, by eat date. */
  movesIn?: { from: string | null; to: string }[];
  movesOut?: { from: string | null; to: string }[];
  /** One entry per covered eating day, in date order. Swaps here apply only to that day; lock follows the trip's cutoff (`locked`). */
  eatingDays?: EatingDaySwaps[];
  /**
   * Swap allowance summary. Config only has per-category caps (maxTuAmount / maxPicksPerTiffin), no
   * per-day or per-trip swap count, so this is always null until such a limit exists.
   */
  swapAllowance?: null;
  /** Resolved meal per covered eating day other than the trip's own date (a carried day has no row of its own). */
  carriedMeals?: Record<string, ResolvedMeal>;
  /** Eating days this trip carries (covers_dates length); 1 for legacy single-day rows. */
  coverCount?: number;
};

// Day-cell aggregator for the customer calendar (this week + next week). Composed entirely from
// existing reads — myDeliveries for day membership/status/cutoff, resolveDeliveryMealsForWeek for
// the resolved pick, and the week's own menu_items for the selectable options list. Never calls
// reconcileMakeups (write-only, run from Server Components — see myPausePanel's sibling comment).
export async function myCalendar(userId: bigint, orderPublicId: string, range: { from: string; until: string }): Promise<CalendarDay[]> {
  await assertOwnsOrder(userId, orderPublicId); // IDOR gate — before any read

  // Customer home renders this; reads below come in two parallel waves (order +
  // rows, then everything keyed by them) rather than ~12 sequential round trips.
  const [[order], allRows] = await Promise.all([
    db
      .select({ id: orders.id, planId: orders.planId, mealSizeId: orders.mealSizeId, categoryCounts: orders.categoryCounts, persons: orders.persons, planType: plans.planType, planKey: plans.key })
      .from(orders)
      .innerJoin(plans, eq(orders.planId, plans.id))
      .where(eq(orders.publicId, orderPublicId))
      .limit(1),
    myDeliveries(userId, range.from, range.until),
  ]);
  if (!order) throw new NotFoundError("Subscription not found");

  const rows = allRows.filter((r) => r.orderPublicId === orderPublicId);
  if (rows.length === 0) return [];

  // Only released weeks are ever shown: an unreleased next-week has no menu to resolve against,
  // so its delivery days are simply absent from the calendar rather than rendered blank.
  // Uses menuService.getReleasedWeeks — same exact weekStart gate as Menu / myDeliveryMeal.
  const weekStarts = [...new Set(rows.map((r) => mondayOfIso(r.deliveryDate)))];
  const rowIds = rows.map((r) => r.id);
  // Merged-source rows carry no tiffins of their own — say where they went.
  const mergeTargetIds = [...new Set(rows.flatMap((r) => (r.mergedIntoDeliveryId ? [r.mergedIntoDeliveryId] : [])))];

  const [releasedWeeks, cats, planDishIds, mergeTargets, extrasById, moves, replacedRows, swapPairs, swapRows] = await Promise.all([
    menuService.getReleasedWeeks(weekStarts),
    dishCategoriesService.forPlanType(order.planType as "tiffin" | "healthy"),
    allowedDishIdsForMealSize(order.mealSizeId),
    mergeTargetIds.length === 0
      ? Promise.resolve([])
      : db.select({ id: deliveries.id, deliveryDate: deliveries.deliveryDate }).from(deliveries).where(inArray(deliveries.id, mergeTargetIds)),
    loadExtraDates(db, rowIds),
    db.select({ fromId: deliveryMoves.fromDeliveryId, toId: deliveryMoves.toDeliveryId, from: deliveryMoves.fromEatDate, to: deliveryMoves.toEatDate })
      .from(deliveryMoves).where(or(inArray(deliveryMoves.toDeliveryId, rowIds), inArray(deliveryMoves.fromDeliveryId, rowIds))),
    db.select({ src: deliveries.makeupForDeliveryId }).from(deliveries).where(inArray(deliveries.makeupForDeliveryId, rowIds)),
    dishCategoriesService.swapPairsForMealSize(order.mealSizeId),
    db
      .select({ deliveryId: deliveryCategorySwaps.deliveryId, publicId: deliveryCategorySwaps.publicId, fromCategory: deliveryCategorySwaps.fromCategory, toCategory: deliveryCategorySwaps.toCategory, qtyFrom: deliveryCategorySwaps.qtyFrom, qtyTo: deliveryCategorySwaps.qtyTo, fromRow: deliveryCategorySwaps.fromRow, receiveTu: deliveryCategorySwaps.receiveTu, forDate: deliveryCategorySwaps.forDate })
      .from(deliveryCategorySwaps)
      .where(inArray(deliveryCategorySwaps.deliveryId, rowIds)).orderBy(asc(deliveryCategorySwaps.id)),
  ]);
  const weekByStart = new Map(releasedWeeks.map((w) => [w.weekStart, w]));
  // A category the plan doesn't include (categoryCounts[key] absent or 0) is never offered,
  // even if it's marked selectable in general — matches resolveCategoriesForDay's own count gate.
  const selectableCats = cats.filter((c) => c.selectable && (order.categoryCounts?.[c.key] ?? 0) > 0);
  const targetDateById = new Map(mergeTargets.map((t) => [t.id, t.deliveryDate]));
  const replaced = new Set(replacedRows.map((r) => r.src));

  const tripFields = (row: CustomerDelivery) => {
    const covers = coveredDates(row);
    return {
      emptied: row.status !== "scheduled" && (row.mergedIntoDeliveryId != null || replaced.has(row.id)),
      movesIn: moves.filter((m) => m.toId === row.id).map(({ from, to }) => ({ from, to })),
      movesOut: moves.filter((m) => m.fromId === row.id && m.toId !== row.id).map(({ from, to }) => ({ from, to })),
      units: row.mergedIntoDeliveryId ? 0 : row.tiffinUnits,
      covers,
      extras: row.mergedIntoDeliveryId ? [] : (extrasById.get(row.id) ?? []),
      coversLabel: row.mergedIntoDeliveryId ? null : formatCoversLabel(covers),
      combinedInto: row.mergedIntoDeliveryId ? (targetDateById.get(row.mergedIntoDeliveryId) ?? null) : null,
    };
  };

  const swapFields = (row: CustomerDelivery) => ({
    eatingDays: coveredDates(row).map((date): EatingDaySwaps => ({
      date,
      swapPairs,
      appliedSwaps: swapRows
        .filter((s) => s.deliveryId === row.id && swapAppliesTo(s.forDate, row.deliveryDate, date))
        .map(({ publicId, fromCategory, toCategory, qtyFrom, qtyTo, fromRow, receiveTu }) => ({ publicId, fromCategory, toCategory, qtyFrom, qtyTo, fromRow, receiveTu })),
    })),
    swapAllowance: null,
  });

  const loadWeek = weekLoader(); // memoizes the week promise, so concurrent days share one read
  const carriedFields = async (row: CustomerDelivery) => {
    const carried = await Promise.all(
      coveredDates(row)
        .filter((date) => date !== row.deliveryDate)
        .map(async (date) => {
          const w = await loadWeek(date);
          if (!w) return null;
          const daySwaps = swapRows.filter((s) => s.deliveryId === row.id && swapAppliesTo(s.forDate, row.deliveryDate, date));
          return [date, await resolveTripDay(order, w, date, 1, daySwaps)] as const;
        }),
    );
    const carriedMeals: Record<string, ResolvedMeal> = {};
    for (const c of carried) if (c) carriedMeals[c[0]] = c[1];
    return { carriedMeals };
  };

  // Per-week caches: myDeliveries can return many days across the same released week, so batch
  // the resolution and the day's menu items once per week instead of once per delivery row.
  const shownWeeks = [...new Map(rows.flatMap((r) => {
    const w = weekByStart.get(mondayOfIso(r.deliveryDate));
    return w ? [[w.id, w] as const] : [];
  })).values()];
  const perWeek = await Promise.all(
    shownWeeks.map(async (week) => {
      const [resolved, items] = await Promise.all([
        resolveDeliveryMealsForWeek({ id: order.id, planId: order.planId, mealSizeId: order.mealSizeId, categoryCounts: order.categoryCounts }, { id: week.id, weekStart: week.weekStart }, order.persons),
        db
          .select({ dayOfWeek: menuItems.dayOfWeek, slot: dishCategories.key, dishId: menuItems.dishId, publicId: dishes.publicId, name: dishes.name, image: dishes.image })
          .from(menuItems)
          .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
          .innerJoin(dishCategories, eq(dishCategories.id, menuItems.categoryId))
          .where(eq(menuItems.menuWeekId, week.id))
          .orderBy(asc(menuItems.position)),
      ]);
      return [week.id, { resolved, items }] as const;
    }),
  );
  const byWeek = new Map(perWeek);

  return Promise.all(rows.map(async (row): Promise<CalendarDay> => {
    const week = weekByStart.get(mondayOfIso(row.deliveryDate));
    const carried = await carriedFields(row);
    if (!week) {
      // Delivery is scheduled but the week's menu isn't released — still show the day tile.
      return {
        date: row.deliveryDate,
        status: row.status as CalendarDay["status"],
        locked: row.cutoffAt <= Date.now(),
        isMakeup: row.isMakeup,
        menuWeekId: null,
        meal: null,
        options: [],
        ...tripFields(row),
        ...swapFields(row),
        ...carried,
        coverCount: coveredDates(row).length,
      };
    }

    const { resolved: weekResolved, items: weekItems } = byWeek.get(week.id)!;
    // delivery_date is a calendar date; explicit-UTC parse (the mandatory `Z`) is required to
    // derive its weekday, or local-midnight parsing shifts the day (spec-6 bug).
    const dayOfWeek = weekdayKey(new Date(`${row.deliveryDate}T00:00:00Z`));
    const meal = weekResolved.get(resolvedMealsWeekKey(dayOfWeek, 1)) ?? null;

    const dayItems = weekItems.filter((i) => i.dayOfWeek === dayOfWeek);
    const options: MealOption[] = selectableCats.flatMap((c) =>
      dayItems
        .filter((i) => i.slot === c.key && planDishIds.has(i.dishId))
        .map((i) => ({ category: c.key, dishId: i.publicId, name: i.name, image: i.image ?? null })),
    );

    return {
      date: row.deliveryDate,
      status: row.status as CalendarDay["status"],
      locked: row.cutoffAt <= Date.now(),
      isMakeup: row.isMakeup,
      menuWeekId: week.publicId,
      meal,
      options,
      ...tripFields(row),
      ...swapFields(row),
      ...carried,
      coverCount: coveredDates(row).length,
    };
  }));
}
