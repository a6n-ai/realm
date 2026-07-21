import { NotFoundError, weekdayKey } from "@realm/commons";
import type { FileDetail } from "@realm/storage/model";
import { and, asc, desc, eq, gte, inArray, lt, lte } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveries, deliveryFrequencies, dishes, mealSizes, menuItems, orderActivities, orders, plans } from "@/db/schema";
import { mondayOfIso } from "@/lib/menu/delivery-dates";
import {
  resolveDeliveryMeal,
  resolveDeliveryMealsForWeek,
  resolvedMealsWeekKey,
  type ResolvedCategory,
} from "@/lib/menu/resolve-delivery-meal";
import { dietsForPlanKey } from "@/lib/menu/selections.service";
import { dishCategoriesService } from "./dish-categories.service";
import { menuService } from "./menu.service";
import { autoResumeIfElapsed } from "./orders.service";
import { getPauseLimits, getPauseUsage } from "./pause-limits.service";
import { deliveredTiffinCount, type DeliveryForCounts } from "./tiffin-counts";

type Delivery = typeof deliveries.$inferSelect;
export type CustomerDelivery = Delivery & { orderPublicId: string; planName: string; isMakeup: boolean };
export type Subscription = {
  publicId: string;
  planName: string;
  planType: "tiffin" | "healthy";
  planKey: string;
  status: string;
  fullName: string;
  addressLine: string;
  city: string;
  postalCode: string;
  zoneId: bigint | null;
  mealSizeName: string;
  persons: number;
  /** Per-category item counts from the meal size at checkout (e.g. sabzi: 2). */
  categoryCounts: Record<string, number>;
};

const VISIBLE = ["scheduled", "paused", "skipped"] as const;

export async function myActiveSubscriptions(userId: bigint): Promise<Subscription[]> {
  // Flip any elapsed pause window back to "active" before reporting status — otherwise a
  // customer whose pause silently expired keeps seeing "paused" until some other write touches
  // the order.
  const pausedOrderIds = await db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.userId, userId), eq(orders.status, "paused")));
  await Promise.all(pausedOrderIds.map((o) => autoResumeIfElapsed(o.id)));

  const rows = await db
    .select({
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
      mealSizeName: mealSizes.name,
      persons: orders.persons,
      categoryCounts: orders.categoryCounts,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .where(and(eq(orders.userId, userId), inArray(orders.status, ["active", "paused"])));
  return rows.map((r) => ({
    ...r,
    categoryCounts: (r.categoryCounts as Record<string, number> | null) ?? {},
  }));
}

/**
 * Customer calendars and home assume one live plan. Prefer `active` over `paused`;
 * if several exist (legacy), pick the newest by createdAt.
 */
export async function myPrimarySubscription(userId: bigint): Promise<Subscription | null> {
  const all = await myActiveSubscriptions(userId);
  if (all.length === 0) return null;
  const active = all.filter((s) => s.status === "active");
  const pool = active.length > 0 ? active : all;
  // myActiveSubscriptions has no createdAt — re-query newest publicId among the pool.
  if (pool.length === 1) return pool[0]!;
  const ids = pool.map((s) => s.publicId);
  const [newest] = await db
    .select({ publicId: orders.publicId })
    .from(orders)
    .where(inArray(orders.publicId, ids))
    .orderBy(desc(orders.createdAt))
    .limit(1);
  return pool.find((s) => s.publicId === newest?.publicId) ?? pool[0]!;
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
  return rows.map((r) => ({
    ...r.d,
    orderPublicId: r.orderPublicId,
    planName: r.planName,
    isMakeup: r.d.makeupForDeliveryId !== null,
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
  /** total − delivered. Includes both future scheduled days and pooled tiffins. */
  remaining: number;
  /** Tiffins owed but not yet placed on a date (schedulable after the last delivery). */
  pooled: number;
};

// Delivered/remaining/pooled tiffins for one subscription, for the deliveries plan header.
// Delivered is derived from the order's delivery rows via the pure tiffin-counts helper; pooled
// is the stored counter maintained by reconcilePoolFromMisses / scheduleFromPool.
export async function myTiffinCounts(userId: bigint, orderPublicId: string): Promise<TiffinCounts> {
  await assertOwnsOrder(userId, orderPublicId); // IDOR gate — before the read
  const [order] = await db
    .select({
      id: orders.id,
      tiffinCount: orders.tiffinCount,
      persons: orders.persons,
      pooled: orders.pooledTiffinCount,
    })
    .from(orders)
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!order) throw new NotFoundError("Subscription not found");

  const rows = await db
    .select({
      status: deliveries.status,
      cutoffAt: deliveries.cutoffAt,
      makeupForDeliveryId: deliveries.makeupForDeliveryId,
      pooledAt: deliveries.pooledAt,
    })
    .from(deliveries)
    .where(eq(deliveries.orderId, order.id));

  const delivered = deliveredTiffinCount(order.persons, rows as DeliveryForCounts[], Date.now());
  return {
    total: order.tiffinCount,
    delivered,
    remaining: order.tiffinCount - delivered,
    pooled: order.pooled,
  };
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
// "you already have" summary on /subscribe. Current (active/paused/waitlisted/
// pending) vs past (cancelled/completed) grouping is done in the component.
export async function mySubscriptionsSummary(userId: bigint): Promise<SubSummary[]> {
  return db
    .select({
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
    .select({ id: orders.id, planId: orders.planId, categoryCounts: orders.categoryCounts, planType: plans.planType })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(eq(orders.publicId, d.orderPublicId))
    .limit(1);
  if (!order) return { pending: true };

  const weekStart = mondayOfIso(d.deliveryDate);
  // Same exact released-week gate as Menu (`menuService.getReleasedWeek`) — never a parallel query.
  const week = await menuService.getReleasedWeek(order.planType as "tiffin" | "healthy", weekStart);
  if (!week) return { pending: true };

  // delivery_date is a calendar date; explicit-UTC parse (the mandatory `Z`) is required to
  // derive its weekday, or local-midnight parsing shifts the day (spec-6 bug).
  const dayOfWeek = weekdayKey(new Date(`${d.deliveryDate}T00:00:00Z`));
  return resolveDeliveryMeal({ id: order.id, planId: order.planId, categoryCounts: order.categoryCounts }, { id: week.id }, dayOfWeek, person);
}

// Reuse resolveDeliveryMeal's own return shape for a single day — one implementation of
// "what a subscriber receives" (resolveCategoriesForDay), never a parallel type.
export type ResolvedMeal = ResolvedCategory[];
export type MealOption = { category: string; dishId: string; name: string; diet: "veg" | "nonveg"; image: FileDetail | null };
export type CalendarDay = {
  date: string;
  status: "scheduled" | "paused" | "skipped" | "cancelled";
  locked: boolean;
  isMakeup: boolean;
  /** Released menu_week publicId; null when the delivery exists but that week's menu isn't out yet. */
  menuWeekId: string | null;
  meal: ResolvedMeal | null;
  options: MealOption[];
};

// Day-cell aggregator for the customer calendar (this week + next week). Composed entirely from
// existing reads — myDeliveries for day membership/status/cutoff, resolveDeliveryMealsForWeek for
// the resolved pick, and the week's own menu_items for the selectable options list. Never calls
// reconcileMakeups (write-only, run from Server Components — see myPausePanel's sibling comment).
export async function myCalendar(userId: bigint, orderPublicId: string, range: { from: string; until: string }): Promise<CalendarDay[]> {
  await assertOwnsOrder(userId, orderPublicId); // IDOR gate — before any read

  const [order] = await db
    .select({ id: orders.id, planId: orders.planId, categoryCounts: orders.categoryCounts, persons: orders.persons, planType: plans.planType, planKey: plans.key })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(eq(orders.publicId, orderPublicId))
    .limit(1);
  if (!order) throw new NotFoundError("Subscription not found");

  const rows = (await myDeliveries(userId, range.from, range.until)).filter((r) => r.orderPublicId === orderPublicId);
  if (rows.length === 0) return [];

  // Only released weeks are ever shown: an unreleased next-week has no menu to resolve against,
  // so its delivery days are simply absent from the calendar rather than rendered blank.
  // Uses menuService.getReleasedWeeks — same exact weekStart gate as Menu / myDeliveryMeal.
  const weekStarts = [...new Set(rows.map((r) => mondayOfIso(r.deliveryDate)))];
  const releasedWeeks = await menuService.getReleasedWeeks(order.planType as "tiffin" | "healthy", weekStarts);
  const weekByStart = new Map(releasedWeeks.map((w) => [w.weekStart, w]));

  const cats = await dishCategoriesService.forPlanType(order.planType as "tiffin" | "healthy");
  // A category the plan doesn't include (categoryCounts[key] absent or 0) is never offered,
  // even if it's marked selectable in general — matches resolveCategoriesForDay's own count gate.
  const selectableCats = cats.filter((c) => c.selectable && (order.categoryCounts?.[c.key] ?? 0) > 0);
  const allowedDiets = dietsForPlanKey(order.planKey);

  // Per-week caches: myDeliveries can return many days across the same released week, so batch
  // the resolution and the day's menu items once per week instead of once per delivery row.
  const resolvedByWeek = new Map<bigint, Awaited<ReturnType<typeof resolveDeliveryMealsForWeek>>>();
  const itemsByWeek = new Map<bigint, { dayOfWeek: string; slot: string; dishId: bigint; publicId: string; name: string; diet: "veg" | "nonveg"; image: FileDetail | null }[]>();

  const out: CalendarDay[] = [];
  for (const row of rows) {
    const week = weekByStart.get(mondayOfIso(row.deliveryDate));
    if (!week) {
      // Delivery is scheduled but the week's menu isn't released — still show the day tile.
      out.push({
        date: row.deliveryDate,
        status: row.status as CalendarDay["status"],
        locked: row.cutoffAt <= Date.now(),
        isMakeup: row.isMakeup,
        menuWeekId: null,
        meal: null,
        options: [],
      });
      continue;
    }

    let weekResolved = resolvedByWeek.get(week.id);
    if (!weekResolved) {
      weekResolved = await resolveDeliveryMealsForWeek({ id: order.id, planId: order.planId, categoryCounts: order.categoryCounts }, { id: week.id }, order.persons);
      resolvedByWeek.set(week.id, weekResolved);
    }
    let weekItems = itemsByWeek.get(week.id);
    if (!weekItems) {
      weekItems = await db
        .select({ dayOfWeek: menuItems.dayOfWeek, slot: menuItems.slot, dishId: menuItems.dishId, publicId: dishes.publicId, name: dishes.name, diet: dishes.diet, image: dishes.image })
        .from(menuItems)
        .innerJoin(dishes, eq(menuItems.dishId, dishes.id))
        .where(eq(menuItems.menuWeekId, week.id))
        .orderBy(asc(menuItems.position));
      itemsByWeek.set(week.id, weekItems);
    }

    // delivery_date is a calendar date; explicit-UTC parse (the mandatory `Z`) is required to
    // derive its weekday, or local-midnight parsing shifts the day (spec-6 bug).
    const dayOfWeek = weekdayKey(new Date(`${row.deliveryDate}T00:00:00Z`));
    const meal = weekResolved.get(resolvedMealsWeekKey(dayOfWeek, 1)) ?? null;

    const dayItems = weekItems.filter((i) => i.dayOfWeek === dayOfWeek);
    const options: MealOption[] = selectableCats.flatMap((c) =>
      dayItems
        .filter((i) => i.slot === c.key && allowedDiets.includes(i.diet))
        .map((i) => ({ category: c.key, dishId: i.publicId, name: i.name, diet: i.diet, image: i.image ?? null })),
    );

    out.push({
      date: row.deliveryDate,
      status: row.status as CalendarDay["status"],
      locked: row.cutoffAt <= Date.now(),
      isMakeup: row.isMakeup,
      menuWeekId: week.publicId,
      meal,
      options,
    });
  }
  return out;
}
