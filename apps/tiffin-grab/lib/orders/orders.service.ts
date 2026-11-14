import { lockUser } from "@/lib/identity/lock-user";
import { orgScope, type Visible } from "@/lib/tenant/org-scope";
import { parseIsoDate } from "@/lib/dates/iso-date";
import { appTodayIso } from "@/lib/dates/today";
import { isCutoffPassed } from "@/lib/dates/cutoff";
import { ONGOING, RUNNING, inOrderStatuses } from "@/lib/orders/status";
import { daysBetween } from "@foundry/commons/util/dates";
import { pageOffset } from "@foundry/design-system/filters/parse-filter-state";
import { wordpressImportSql } from "@/lib/orders/wordpress-import-sql";
import { isWordpressImport } from "@/lib/orders/wordpress-import";
import { NotFoundError, ValidationError, cutoffMsFor } from "@foundry/commons";
import type { Condition } from "@foundry/commons/model/condition";
import type { Page, PageRequest } from "@foundry/commons/util/pagination";
import { BaseRepository, UpdatableRepository, pageOrder } from "@foundry/database";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { orderPaymentStatuses, paidStatusOf } from "@/lib/payments/order-payments";
import { clearLookOutOnEnd } from "@/lib/orders/look-out";
import { db } from "@/db/client";
import { startPaidStripeOrder } from "@/lib/orders/start-paid-order";
import { ordersListWhere, type OrdersListOpts } from "@/lib/orders/queries";
import {
  deliveries,
  deliveryCategorySwaps,
  deliveryExtraTiffins,
  deliveryMoves,
  mealSelections,
  deliveryFrequencies,
  mealSizes,
  orderActivities,
  orderAddons,
  orders,
  payments,
  plans,
  subscriptionPauses,
  users,
  type AddonRequest,
  type PaymentProof,
} from "@/db/schema";
import { SessionBaseService, SessionUpdatableService } from "../services/session-service";
import type { SortState } from "@foundry/design-system/list-sort";
import { buildBoundedDeliveryRows, tripsFor } from "@/lib/orders/bounded-deliveries";
import { cancelDeliveries, dropVoidRows } from "../deliveries/deliveries.service";
import { removeStopsBestEffort } from "../optimoroute/stops";
import { applyHolidaysToOrder, scheduleWrite } from "../deliveries/holiday-apply";
import { assertStartable } from "./order-window";
import { appToday, assertFirstDeliveryOpen, validateStartDate } from "@/lib/dates/start-date";
import { assertTrialStart } from "@/lib/trial/schedule";
import {
  reverseCoinRedemption,
  reverseCoinAward,
  awardOrderCoins,
} from "../wallet/wallet.service";
import { awardReferral, reverseReferral } from "../referrals/referrals.service";
import { assertReassignAllowed, resolveAssignableOwner } from "../staff/reassign";
import { eatingDaysError, orderDeliveryDays, planDaysError, planDeliveryDays, planWeek, type DayOfWeek } from "@/lib/deliveries/schedule/delivery-days";
import { mealSizeAllowedDays, mealSizeServesWeekends } from "../deliveries/weekend-dish";
import { getAppSettings } from "@/lib/settings";
import { lockOrder, withOrderLock } from "./order-lock";
import { enqueueOrderNotice } from "@/lib/notifications/order-notice";

export type OrderListRow = {
  publicId: string;
  deploymentId: string;
  fullName: string;
  city: string;
  planKey: string;
  status: string;
  /** Latest payment row status when present — drives the Payment review badge overlay. */
  paymentStatus: string | null;
  startDate: string;
  total: string;
  createdAt: number;
  ownerId: string | null;
  ownerName: string | null;
  trial: boolean;
  lookOut: boolean;
  lookOutNote: string | null;
  lookOutAt: number | null;
  /** Free tiffins staff gave on top of the plan. */
  freeTiffins: number;
};

export type OrderSortColumn = "name" | "deployment" | "status" | "start" | "total" | "created" | "flagged";

// The count runs on the base `orders` table alone with the identical `where`, so the nullable owner join can't inflate it.
/** Staff actions that take an order public id: refuse an order outside the caller's organizations. */
export async function assertOrderVisible(publicId: string, visible: Visible): Promise<void> {
  if (visible !== "all" && visible.length === 0) throw new NotFoundError("Order not found");
  const [row] = await db.select({ id: orders.id }).from(orders)
    .where(and(eq(orders.publicId, publicId), orgScope(orders.organizationId, visible)))
    .limit(1);
  if (!row) throw new NotFoundError("Order not found");
}

// Actions that take a delivery or payment id resolve the order from that row, never from an
// order id the client sent alongside it.
export async function assertDeliveryVisible(deliveryPublicId: string, visible: Visible): Promise<void> {
  const [row] = await db.select({ publicId: orders.publicId }).from(deliveries)
    .innerJoin(orders, eq(orders.id, deliveries.orderId)).where(eq(deliveries.publicId, deliveryPublicId)).limit(1);
  if (!row) throw new NotFoundError("Order not found");
  await assertOrderVisible(row.publicId, visible);
}

export async function assertPaymentVisible(paymentPublicId: string, visible: Visible): Promise<void> {
  const [row] = await db.select({ publicId: orders.publicId }).from(payments)
    .innerJoin(orders, eq(orders.id, payments.orderId)).where(eq(payments.publicId, paymentPublicId)).limit(1);
  if (!row) throw new NotFoundError("Order not found");
  await assertOrderVisible(row.publicId, visible);
}

export async function listOrdersPage(
  condition: Condition | undefined,
  page: PageRequest,
  sort: SortState<OrderSortColumn> = { column: "created", dir: "desc" },
  visible: Visible,
  opts: OrdersListOpts = {},
): Promise<Page<OrderListRow>> {
  const where = ordersListWhere(condition, visible, opts);

  const SORT_COL = {
    name: orders.fullName,
    deployment: orders.deploymentId,
    status: orders.status,
    start: orders.startDate,
    total: orders.total,
    created: orders.createdAt,
    flagged: orders.lookOutAt,
  } as const;
  const col = SORT_COL[sort.column] ?? orders.createdAt;

  const [rows, [{ count }]] = await Promise.all([
    db
      .select({
        id: orders.id,
        userId: orders.userId,
        publicId: orders.publicId,
        deploymentId: orders.deploymentId,
        fullName: orders.fullName,
        city: orders.city,
        planKey: plans.key,
        status: orders.status,
        startDate: orders.startDate,
        total: orders.total,
        createdAt: orders.createdAt,
        ownerId: users.publicId,
        ownerName: users.name,
        trialLength: orders.trialLength,
        lookOutAt: orders.lookOutAt,
        lookOutNote: orders.lookOutNote,
        freeTiffins: orders.complimentaryTiffins,
      })
      .from(orders)
      .innerJoin(plans, eq(orders.planId, plans.id))
      .leftJoin(users, eq(orders.currentOwner, users.id))
      .where(where)
      .orderBy(...pageOrder(sort.dir, col, orders.id))
      .limit(page.size)
      .offset(pageOffset(page.page, page.size)),
    db
      .select({ count: sql<number>`cast(count(*) as int)` })
      .from(orders)
      .where(where),
  ]);

  // One payment status per order (newest wins) for the admin badge overlay — keep
  // the list query free of a multiplying payments join.
  const paymentByOrder = new Map<string, string>();
  if (rows.length > 0) {
    for (const [orderId, statuses] of await orderPaymentStatuses(db, rows.map((r) => r.id))) paymentByOrder.set(orderId.toString(), statuses[0]!);
  }

  const items: OrderListRow[] = rows.map((r) => {
    return {
      publicId: r.publicId,
      deploymentId: r.deploymentId,
      fullName: r.fullName,
      city: r.city,
      planKey: r.planKey,
      status: r.status,
      paymentStatus: paymentByOrder.get(r.id.toString()) ?? null,
      startDate: r.startDate,
      total: r.total,
      createdAt: r.createdAt,
      ownerId: r.ownerId ?? null,
      ownerName: r.ownerName ?? null,
      trial: r.trialLength != null,
      lookOut: r.lookOutAt != null,
      lookOutNote: r.lookOutNote,
      lookOutAt: r.lookOutAt,
      freeTiffins: r.freeTiffins,
    };
  });
  return { items, page: page.page, size: page.size, total: count };
}

export type OrderPaymentDetail = {
  publicId: string;
  amount: string;
  status: (typeof payments.status.enumValues)[number];
  method: (typeof payments.method.enumValues)[number];
  reference: string | null;
  proof: PaymentProof | null;
  claimedAt: number | null;
  capturedAt: number | null;
  createdAt: number;
  note: string | null;
  // Public thumb URL for inline display; null when no proof.
  proofThumbUrl: string | null;
  // Token-gated href for the secured original; null when no proof.
  proofHref: string | null;
  cardBrand: string | null;
  cardLast4: string | null;
  surchargeAmount: string;
  taxSource: string | null;
  providerRef: string | null;
  providerCheckedAt: number | null;
  expiresAt: number | null;
  addonRequest: AddonRequest | null;
};

export type OrderDetail = typeof orders.$inferSelect & {
  planName: string;
  planKey: string;
  frequencyKey: string;
  frequencyName: string;
  frequencyWeekdays: string[] | null;
  mealSizeName: string;
  payments: OrderPaymentDetail[];
  /** Add-ons sold on the order; each qty is an extra row in every tiffin. */
  addons: { key: string; name: string; category: string; qty: number; pricePerTiffin: string }[];
};

// Same org scoping as listOrdersPage (see @foundry/auth resolveVisibleOrgIds). A
// publicId is unguessable but not a permission — direct-link/URL access must not
// bypass membership scoping. Out-of-scope orders fail exactly like nonexistent ones
// (NotFoundError) so a caller can't distinguish "not visible" from "doesn't exist".
export async function readOrder(publicId: string, visible: Visible): Promise<OrderDetail> {
  const [row] = await db
    .select({
      order: orders,
      planName: plans.name,
      planKey: plans.key,
      frequencyKey: deliveryFrequencies.key,
      frequencyName: deliveryFrequencies.name,
      frequencyWeekdays: deliveryFrequencies.weekdays,
      mealSizeName: mealSizes.name,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .where(
      and(
        eq(orders.publicId, publicId),
        orgScope(orders.organizationId, visible),
      ),
    )
    .limit(1);
  if (!row) throw new NotFoundError("Order not found");
  const addons = await db
    .select({ key: orderAddons.addonKey, name: orderAddons.addonName, category: orderAddons.category, qty: orderAddons.qty, pricePerTiffin: orderAddons.pricePerTiffin })
    .from(orderAddons)
    .where(eq(orderAddons.orderId, row.order.id))
    .orderBy(asc(orderAddons.id));
  const pays = await db
    .select({
      publicId: payments.publicId,
      amount: payments.amount,
      status: payments.status,
      method: payments.method,
      reference: payments.reference,
      proof: payments.proof,
      claimedAt: payments.claimedAt,
      capturedAt: payments.capturedAt,
      createdAt: payments.createdAt,
      note: payments.note,
      cardBrand: payments.cardBrand,
      cardLast4: payments.cardLast4,
      surchargeAmount: payments.surchargeAmount,
      taxSource: payments.taxSource,
      providerRef: payments.providerRef,
      providerCheckedAt: payments.providerCheckedAt,
      expiresAt: payments.expiresAt,
      addonRequest: payments.addonRequest,
    })
    .from(payments)
    .where(eq(payments.orderId, row.order.id));

  // Lazy import avoids pulling storage/mint into every orders.service caller path
  // that doesn't need proof hrefs (createOrder tests, etc.).
  const { proofView } = await import("../support/ticket-attachments");
  const enriched: OrderPaymentDetail[] = await Promise.all(
    pays.map(async (p) => {
      const proof = p.proof ?? null;
      const view = await proofView(proof, [`payments/${p.publicId}`, `payments/${row.order.publicId}`]);
      return {
        ...p,
        proof,
        proofThumbUrl: view?.thumbUrl ?? null,
        proofHref: view?.href ?? null,
      };
    }),
  );

  return {
    ...row.order,
    addons,
    planName: row.planName,
    planKey: row.planKey,
    frequencyKey: row.frequencyKey,
    frequencyName: row.frequencyName,
    frequencyWeekdays: row.frequencyWeekdays,
    mealSizeName: row.mealSizeName,
    payments: enriched,
  };
}

export async function listOrderActivities(orderId: bigint) {
  const rows = await db
    .select({
      publicId: orderActivities.publicId,
      type: orderActivities.type,
      note: orderActivities.note,
      fromStatus: orderActivities.fromStatus,
      toStatus: orderActivities.toStatus,
      deliveryId: orderActivities.deliveryId,
      createdAt: orderActivities.createdAt,
      createdBy: orderActivities.createdBy,
      actorName: users.name,
      actorEmail: users.email,
      actorRole: users.role,
    })
    .from(orderActivities)
    .leftJoin(users, eq(orderActivities.createdBy, users.id))
    .where(eq(orderActivities.orderId, orderId))
    .orderBy(desc(orderActivities.createdAt));
  return rows;
}

export async function listCustomerOrderActivities(userId: bigint) {
  return db
    .select({
      publicId: orderActivities.publicId,
      type: orderActivities.type,
      note: orderActivities.note,
      fromStatus: orderActivities.fromStatus,
      toStatus: orderActivities.toStatus,
      createdAt: orderActivities.createdAt,
      createdBy: orderActivities.createdBy,
      actorName: users.name,
      actorEmail: users.email,
      actorRole: users.role,
      orderPublicId: orders.publicId,
      deploymentId: orders.deploymentId,
    })
    .from(orderActivities)
    .innerJoin(orders, eq(orders.id, orderActivities.orderId))
    .leftJoin(users, eq(orderActivities.createdBy, users.id))
    .where(eq(orders.userId, userId))
    .orderBy(desc(orderActivities.createdAt));
}

// Entity update and activity create are sequential writes: commons repositories each hold their own connection.
class OrdersService extends SessionUpdatableService<typeof orders> {
  private readonly activities = new SessionBaseService(
    new BaseRepository(db, orderActivities, orderActivities.publicId, orderActivities.id),
  );

  // durationWeeks/frequencyId drive delivery-row materialization (row count, cutoff dates);
  // once rows exist, changing either would silently desync them from the schedule they were
  // materialized against. Freeze both the moment any delivery row exists — including a
  // cancelled subscription's void rows, since cancel() never deletes them.
  async update(publicId: string, patch: Record<string, unknown>): Promise<typeof orders.$inferSelect> {
    if (patch.durationWeeks !== undefined || patch.frequencyId !== undefined) {
      const order = await this.read(publicId);
      const [row] = await db.select({ id: deliveries.id }).from(deliveries)
        .where(eq(deliveries.orderId, order.id)).limit(1);
      if (row) throw new ValidationError("Duration and frequency are fixed once a subscription is active");
    }
    return super.update(publicId, patch);
  }

  async activate(publicId: string): Promise<void> {
    const order = await this.read(publicId);
    const actorId = await this.currentUserId();
    // A paid Stripe order the payment could not start (overlap): staff start it once the conflict is gone.
    if (order.status === "pending" && order.userId != null && !isWordpressImport(order)) {
      const [pay] = await db.select({ status: payments.status }).from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.method, "stripe"), eq(payments.status, "paid"))).limit(1);
      if (pay) {
        await db.transaction(async (tx) => {
          const { started, reason } = await startPaidStripeOrder(tx, order, actorId);
          if (!started) throw new ValidationError(reason ?? "Could not start this order");
          const [fresh] = await tx.select().from(orders).where(eq(orders.id, order.id)).limit(1);
          if (fresh) {
            await awardReferral(tx, fresh, "paid");
            await awardOrderCoins(tx, fresh, "paid");
          }
        });
        return;
      }
    }
    if (order.status !== "waitlisted") {
      throw new ValidationError(`Cannot activate an order that is ${order.status}`);
    }

    // Status flip + delivery materialization + activity log in one tx: if materialization throws, the whole
    // activation rolls back. Bypasses update()/transition(): they aren't tx-aware, and an "active" order with zero delivery rows must never commit.
    await withOrderLock(order.id, async (tx) => {
      // Waitlisted orders skipped the overlap guard at checkout (they held no days); it runs on activation.
      await assertStartable(tx, { userId: order.userId, organizationId: order.organizationId, startDate: order.startDate, durationWeeks: order.durationWeeks, excludeOrderId: order.id, holiday: false });
      const [row] = await tx
        .update(orders)
        .set({ status: "active", updatedBy: actorId })
        .where(eq(orders.publicId, publicId))
        .returning();
      if (!row) throw new NotFoundError(`Order not found: ${publicId}`);
      await tx.insert(orderActivities).values({
        orderId: row.id,
        type: "activated",
        fromStatus: order.status,
        toStatus: "active",
        createdBy: actorId,
      });
      await scheduleWrite(tx, row, actorId, { materialize: true });
      // An unverified real-method payment earns later, in verifyPayment.
      const paidStatus = paidStatusOf((await orderPaymentStatuses(tx, [row.id])).get(row.id));
      await awardReferral(tx, row, paidStatus);
      await awardOrderCoins(tx, row, paidStatus);
    });
  }

  // A plan migrated from WordPress (one-off import, finished) waits as `pending` with its
  // prepaid balance and no deliveries while WordPress still delivers. Staff start it on the
  // day the customer leaves WordPress: the balance is scheduled from that date, bounded to
  // the exact count (materializeDeliveries only fills whole weeks). No payment or coin
  // award: it was paid on WordPress.
  async startMigrated(publicId: string, startDate: string): Promise<void> {
    const actorId = await this.currentUserId();
    const { timezone, cutoffHour } = await getAppSettings();
    if (parseIsoDate(startDate) == null || startDate < appTodayIso(timezone)) {
      throw new ValidationError("Pick today or a later date");
    }
    await withOrderLock(publicId, async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.publicId, publicId)).for("update").limit(1);
      if (!order) throw new NotFoundError(`Order not found: ${publicId}`);
      if (order.status !== "pending" || !isWordpressImport(order)) {
        throw new ValidationError("Only a pending plan migrated from WordPress can be started here");
      }
      const [freq] = await tx.select({ key: deliveryFrequencies.key }).from(deliveryFrequencies)
        .where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
      if (!freq) throw new ValidationError("Delivery frequency not found");
      const rows = buildBoundedDeliveryRows({
        startDate,
        trips: tripsFor(freq.key, (order.eatingDays ?? []) as DayOfWeek[]),
        persons: order.persons,
        targetTiffinCount: order.tiffinCount,
      }).map((r) => ({ ...r, cutoffAt: cutoffMsFor(r.deliveryDate, cutoffHour, timezone) }));
      if (!rows.length) throw new ValidationError("This plan has no tiffins left to schedule");
      assertFirstDeliveryOpen(rows[0]);
      // Bounded rows can run past durationWeeks; cover the span they actually occupy.
      const spanDays = daysBetween(startDate, rows.at(-1)!.deliveryDate) + 1;
      await assertStartable(tx, { userId: order.userId, organizationId: order.organizationId, startDate, durationWeeks: Math.max(order.durationWeeks, Math.ceil(spanDays / 7)), excludeOrderId: order.id });

      const [started] = await tx.update(orders).set({ status: "active", startDate, updatedBy: actorId, updatedAt: Date.now() })
        .where(eq(orders.id, order.id)).returning();
      await tx.insert(deliveries).values(rows.map((r) => ({
        orderId: order.id,
        deliveryDate: r.deliveryDate,
        status: "scheduled" as const,
        cutoffAt: r.cutoffAt,
        tiffinUnits: r.tiffinUnits,
        coversDates: r.coversDates,
        organizationId: order.organizationId,
      })));
      await applyHolidaysToOrder(tx, started!, actorId);
      await tx.insert(orderActivities).values({
        orderId: order.id,
        type: "activated",
        fromStatus: "pending",
        toStatus: "active",
        note: `Started from WordPress on ${startDate}: ${order.tiffinCount} tiffins, last ${rows.at(-1)!.deliveryDate}`,
        createdBy: actorId,
      });
    });
  }

  /**
   * Why this order's start date can't move, or null when it can: nothing has
   * happened yet. Every delivery is still scheduled before its cutoff and the
   * customer hasn't paused, skipped, moved, swapped, added tiffins or picked dishes,
   * so its deliveries can be rebuilt from a new start without losing anything.
   */
  async startChangeBlocker(orderId: bigint, status: string, tx: Pick<typeof db, "select"> = db): Promise<string | null> {
    if (status !== "active" && status !== "pending" && status !== "waitlisted") return "Only a plan that hasn't started can move its start date";
    const all = await tx.select({ id: deliveries.id, status: deliveries.status, cutoffAt: deliveries.cutoffAt, holidayId: deliveries.holidayId })
      .from(deliveries).where(eq(deliveries.orderId, orderId));
    const now = Date.now();
    // A row a holiday closed was paused by the kitchen, not the customer; the rebuild re-applies holidays.
    const rows = all.filter((d) => !(d.status === "paused" && d.holidayId != null));
    if (rows.some((d) => isCutoffPassed(d.cutoffAt, now))) return "This plan has started: its first delivery is past the cutoff";
    if (rows.some((d) => d.status !== "scheduled")) return "The customer has already skipped or paused a delivery";
    const ids = all.map((d) => d.id);
    const touched = await Promise.all([
      tx.select({ id: subscriptionPauses.id }).from(subscriptionPauses).where(eq(subscriptionPauses.orderId, orderId)).limit(1),
      tx.select({ id: mealSelections.id }).from(mealSelections).where(eq(mealSelections.orderId, orderId)).limit(1),
      ids.length ? tx.select({ id: deliveryMoves.id }).from(deliveryMoves).where(eq(deliveryMoves.orderId, orderId)).limit(1) : [],
      ids.length ? tx.select({ id: deliveryCategorySwaps.id }).from(deliveryCategorySwaps).where(inArray(deliveryCategorySwaps.deliveryId, ids)).limit(1) : [],
      ids.length ? tx.select({ id: deliveryExtraTiffins.id }).from(deliveryExtraTiffins).where(inArray(deliveryExtraTiffins.deliveryId, ids)).limit(1) : [],
    ]);
    if (touched.some((r) => r.length > 0)) return "The customer has already changed this plan's deliveries or dishes";
    return null;
  }

  // Admin: move a plan's start before it starts. Its untouched deliveries are rebuilt
  // from the new date. An eating-days plan lays out its paid tiffin count rather than
  // whole weeks: changeEatingDays stretches durationWeeks to the plan's calendar span,
  // so weeks x days no longer equals what was bought.
  // `force` (staff with order:write, gated in the action) ignores the cutoff: the earliest day
  // counts from today's calendar date and the first delivery may already be past its cutoff.
  async changeStartDate(publicId: string, startDate: string, opts: { force?: boolean } = {}): Promise<void> {
    const force = opts.force === true;
    const actorId = await this.currentUserId();
    const { timezone, cutoffHour } = await getAppSettings();
    await withOrderLock(publicId, async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.publicId, publicId)).for("update").limit(1);
      if (!order) throw new NotFoundError(`Order not found: ${publicId}`);
      const blocker = await this.startChangeBlocker(order.id, order.status, tx);
      if (blocker) throw new ValidationError(blocker);
      if (startDate === order.startDate) return;
      const today = force ? appToday(timezone) : appToday(timezone, cutoffHour);
      if (order.trialLength != null) {
        assertTrialStart(startDate, order.trialWeekdays ?? [], today);
      } else {
        const [plan] = await tx.select({ allowedStartDays: plans.allowedStartDays }).from(plans).where(eq(plans.id, order.planId)).limit(1);
        validateStartDate(startDate, plan?.allowedStartDays ?? [], today);
      }
      // Waitlisted/pending plans hold no days yet; they meet the overlap guard when they activate.
      await assertStartable(tx, { userId: inOrderStatuses(RUNNING, order.status) ? order.userId : null, organizationId: order.organizationId, startDate, durationWeeks: order.durationWeeks, excludeOrderId: order.id });

      const [moved] = await tx.update(orders).set({ startDate, updatedBy: actorId, updatedAt: Date.now() })
        .where(eq(orders.id, order.id)).returning();
      const [had] = await tx.select({ id: deliveries.id }).from(deliveries).where(eq(deliveries.orderId, order.id)).limit(1);
      if (had) {
        await tx.delete(deliveries).where(eq(deliveries.orderId, order.id));
        const bounded = order.trialLength == null && !!order.eatingDays?.length;
        if (bounded) {
          const [freq] = await tx.select({ key: deliveryFrequencies.key, weekdays: deliveryFrequencies.weekdays }).from(deliveryFrequencies)
            .where(eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
          if (!freq) throw new ValidationError("Delivery frequency not found");
          const trips = planWeek(
            orderDeliveryDays({ frequencyKey: freq.key, weekdays: freq.weekdays as DayOfWeek[] | null, includeSaturday: false, includeSunday: false }),
            order.eatingDays as DayOfWeek[],
          );
          if (!trips) throw new ValidationError("An eating day falls before the first delivery day of this frequency");
          const rows = buildBoundedDeliveryRows({ startDate, trips, persons: order.persons, targetTiffinCount: order.tiffinCount });
          if (!rows.length) throw new ValidationError("This plan has no tiffins left to schedule");
          await tx.insert(deliveries).values(rows.map((r) => ({
            ...r,
            orderId: order.id,
            status: "scheduled" as const,
            cutoffAt: cutoffMsFor(r.deliveryDate, cutoffHour, timezone),
            organizationId: order.organizationId,
          })));
        }
        await scheduleWrite(tx, moved!, actorId, { materialize: !bounded });
        const placed = await tx.select({ deliveryDate: deliveries.deliveryDate, cutoffAt: deliveries.cutoffAt }).from(deliveries)
          .where(eq(deliveries.orderId, order.id)).orderBy(asc(deliveries.deliveryDate));
        if (!force) assertFirstDeliveryOpen(placed[0]);
        if (bounded && placed.length) {
          // The overlap guard reads durationWeeks: keep it at the span these rows occupy.
          const spanDays = daysBetween(startDate, placed.at(-1)!.deliveryDate) + 1;
          await tx.update(orders).set({ durationWeeks: Math.max(1, Math.ceil(spanDays / 7)) }).where(eq(orders.id, order.id));
        }
      }
      await tx.insert(orderActivities).values({
        orderId: order.id,
        type: "note",
        note: `Start date moved from ${order.startDate} to ${startDate}${force ? " (forced past cutoff)" : ""}`,
        createdBy: actorId,
        organizationId: order.organizationId,
      });
    });
  }

  // Admin: change which days the customer eats. The delivery days (frequency) and the tiffin
  // balance stay as they are; only deliveries nobody has touched are laid out again, so the
  // last delivery date moves. Delivered, held, moved, swapped, re-addressed and routed rows
  // keep their date and the open tiffins are laid around them; only a moved tiffin left after
  // the new last day is brought forward to follow it.
  async changeEatingDays(publicId: string, days: DayOfWeek[]): Promise<void> {
    const actorId = await this.currentUserId();
    const { timezone, cutoffHour, minTiffinsPerWeek, maxTiffinsPerWeek } = await getAppSettings();
    const label = (d: readonly string[]) => d.map((x) => x.charAt(0).toUpperCase() + x.slice(1)).join(", ");
    await withOrderLock(publicId, async (tx) => {
      const [order] = await tx.select().from(orders).where(eq(orders.publicId, publicId)).for("update").limit(1);
      if (!order) throw new NotFoundError(`Order not found: ${publicId}`);
      if (!inOrderStatuses(ONGOING, order.status)) {
        throw new ValidationError("Eating days can only change on a plan that is running or waiting to start");
      }
      if (order.trialLength != null) throw new ValidationError("A trial's days come from its trial schedule");

      // WordPress plans all ride the 5-day route; one imported as MWF moves onto it here.
      const [freq] = await tx.select({ id: deliveryFrequencies.id, key: deliveryFrequencies.key, weekdays: deliveryFrequencies.weekdays }).from(deliveryFrequencies)
        .where(isWordpressImport(order) ? eq(deliveryFrequencies.key, "5_day") : eq(deliveryFrequencies.id, order.frequencyId)).limit(1);
      if (!freq) throw new ValidationError("Delivery frequency not found");
      const toFiveDay = freq.id !== order.frequencyId;
      const frequency = { frequencyKey: freq.key, weekdays: freq.weekdays as DayOfWeek[] | null };
      const deliveryDays = orderDeliveryDays({ ...frequency, includeSaturday: false, includeSunday: false });
      const err = eatingDaysError(deliveryDays, days, { min: minTiffinsPerWeek, max: maxTiffinsPerWeek })
        ?? planDaysError({ eatingDays: days, servesWeekends: await mealSizeServesWeekends(order.mealSizeId, tx), allowed: await mealSizeAllowedDays(order.mealSizeId, tx), trial: false });
      if (err) throw new ValidationError(err);
      const trips = planWeek(deliveryDays, days)!;
      const next = trips.flatMap((t) => t.days);
      const before = (order.eatingDays as DayOfWeek[] | null)
        ?? planDeliveryDays(order, { key: freq.key, weekdays: frequency.weekdays });
      if (before.join() === next.join() && !toFiveDay) return;

      const rows = await tx.select().from(deliveries).where(eq(deliveries.orderId, order.id));
      const ids = rows.map((r) => r.id);
      const [swaps, extras, moves] = ids.length ? await Promise.all([
        tx.select({ id: deliveryCategorySwaps.deliveryId }).from(deliveryCategorySwaps).where(inArray(deliveryCategorySwaps.deliveryId, ids)),
        tx.select({ id: deliveryExtraTiffins.deliveryId }).from(deliveryExtraTiffins).where(inArray(deliveryExtraTiffins.deliveryId, ids)),
        tx.select({ a: deliveryMoves.fromDeliveryId, b: deliveryMoves.toDeliveryId }).from(deliveryMoves).where(eq(deliveryMoves.orderId, order.id)),
      ]) : [[], [], []];
      const linked = (r: (typeof rows)[number]) => [r.mergedIntoDeliveryId, r.makeupForDeliveryId, r.complimentaryForDeliveryId];
      const edited = new Set([...swaps.map((x) => x.id), ...extras.map((x) => x.id)]);
      const tied = new Set([...edited, ...moves.flatMap((x) => [x.a, x.b]), ...rows.flatMap(linked)]);
      const now = Date.now();
      const open = rows.filter((r) => r.status === "scheduled" && !isCutoffPassed(r.cutoffAt, now) && !r.routeSyncedAt && !r.optimoCompletionStatus
        && r.complimentaryNote == null && r.addressLine == null && r.addressId == null
        && linked(r).every((x) => x == null) && !tied.has(r.id)
        // A day a holiday added keeps its link to the closed day; the ordinary rows are laid around it.
        && r.holidayExtraForDeliveryId == null);
      const units = open.reduce((n, r) => n + r.tiffinUnits, 0);
      // A tiffin moved to its own later day and not touched since: it can follow the plan's end.
      const movable = rows.filter((r) => r.makeupForDeliveryId != null && r.status === "scheduled" && !isCutoffPassed(r.cutoffAt, now)
        && !r.routeSyncedAt && !r.optimoCompletionStatus && r.complimentaryNote == null && r.addressLine == null && r.addressId == null
        && r.mergedIntoDeliveryId == null && r.complimentaryForDeliveryId == null && !edited.has(r.id)
        && (r.coversDates == null || (r.coversDates.length === 1 && r.coversDates[0] === r.deliveryDate))
        && !rows.some((o) => o.mergedIntoDeliveryId === r.id || o.complimentaryForDeliveryId === r.id));
      const pulled = new Map<bigint, string>();

      const laid: { deliveryDate: string; tiffinUnits: number; coversDates: string[]; cutoffAt: number }[] = [];
      if (units > 0) {
        // Never earlier than the first open delivery: a plan that hasn't started stays put.
        const start = open.map((r) => r.deliveryDate).sort()[0]!;
        const openIds = new Set(open.map((r) => r.id));
        const dropped = await dropVoidRows(tx, order.id, rows.filter((r) => r.status === "cancelled" && r.deliveryDate >= start).map((r) => r.deliveryDate));
        const kept = rows.filter((r) => !dropped.has(r.id));
        const taken = new Set(kept.filter((r) => !openIds.has(r.id) && r.deliveryDate >= start).map((r) => r.deliveryDate));
        // Padded so the rows skipped for a kept date never run the candidates short.
        const candidates = buildBoundedDeliveryRows({ startDate: start, trips, persons: order.persons, targetTiffinCount: units + (taken.size + 1) * 7 * order.persons });
        let left = units;
        for (const c of candidates) {
          if (left <= 0) break;
          if (taken.has(c.deliveryDate)) continue;
          const tiffinUnits = Math.min(c.tiffinUnits, left);
          laid.push({
            deliveryDate: c.deliveryDate,
            tiffinUnits,
            coversDates: c.coversDates.slice(0, Math.ceil(tiffinUnits / order.persons)),
            cutoffAt: cutoffMsFor(c.deliveryDate, cutoffHour, timezone),
          });
          left -= tiffinUnits;
        }
        if (left > 0) throw new ValidationError("Couldn't fit the remaining tiffins on these days");
        await tx.delete(deliveries).where(inArray(deliveries.id, [...openIds]));
        await tx.insert(deliveries).values(laid.map((r) => ({ ...r, orderId: order.id, status: "scheduled" as const, organizationId: order.organizationId })));

        // A moved tiffin parked after the old last day would be stranded when the plan gets
        // shorter: bring it up to the first free days after the new end. Never pushed later.
        // A cancelled row a move still points at survives dropVoidRows; it's no plan day either.
        const end = [...laid.map((r) => r.deliveryDate), ...kept.filter((r) => !openIds.has(r.id) && !movable.includes(r) && r.status !== "cancelled").map((r) => r.deliveryDate)].sort().at(-1)!;
        const free = candidates.map((c) => c.deliveryDate).filter((d) => d > end && !taken.has(d));
        const tail = movable.filter((r) => r.deliveryDate > end).sort((a, b) => a.deliveryDate.localeCompare(b.deliveryDate));
        for (const [i, r] of tail.entries()) {
          const to = free[i];
          if (!to || to >= r.deliveryDate) break;
          await tx.update(deliveries).set({ deliveryDate: to, coversDates: r.coversDates && [to], cutoffAt: cutoffMsFor(to, cutoffHour, timezone) })
            .where(eq(deliveries.id, r.id));
          await tx.update(deliveryMoves).set({ toEatDate: to })
            .where(and(eq(deliveryMoves.toDeliveryId, r.id), eq(deliveryMoves.toEatDate, r.deliveryDate)));
          pulled.set(r.id, to);
        }
      }

      // The overlap guard reads durationWeeks; keep it covering a plan that now runs longer.
      const last = [...laid.map((r) => r.deliveryDate), ...rows.filter((r) => !open.includes(r) && r.status === "scheduled").map((r) => pulled.get(r.id) ?? r.deliveryDate)].sort().at(-1);
      const spanWeeks = last ? Math.ceil((daysBetween(order.startDate, last) + 1) / 7) : 0;
      const [relaid] = await tx.update(orders).set({
        frequencyId: freq.id,
        eatingDays: next,
        includeSaturday: next.includes("sat"),
        includeSunday: next.includes("sun"),
        durationWeeks: Math.max(order.durationWeeks, spanWeeks),
        updatedBy: actorId,
        updatedAt: Date.now(),
      }).where(eq(orders.id, order.id)).returning();
      // The new layout can land a day on a declared holiday; close it like any other schedule write.
      await applyHolidaysToOrder(tx, relaid!, actorId);
      await tx.insert(orderActivities).values({
        orderId: order.id,
        type: "note",
        note: (before.join() === next.join() ? `Delivery moved to 5 days a week, eating ${label(next)}` : `Eating days changed from ${label(before)} to ${label(next)}`)
          + (toFiveDay && before.join() !== next.join() ? ", delivery now 5 days a week" : "")
          + (laid.length ? `. ${units} upcoming tiffin${units === 1 ? "" : "s"} rescheduled` : "")
          + (pulled.size ? `, ${pulled.size} moved tiffin${pulled.size === 1 ? "" : "s"} brought forward` : "")
          + (laid.length ? `, last delivery ${last}` : ""),
        createdBy: actorId,
        organizationId: order.organizationId,
      });
    });
  }

  // Switch-over day: start every WordPress plan still waiting, from `fromDate` or its own
  // later next-due date (a customer WordPress hasn't started yet keeps that start). One plan
  // failing (cutoff passed, no balance) never stops the rest; each result says what happened.
  async startAllMigrated(fromDate: string): Promise<{ started: number; failed: { deploymentId: string; error: string }[] }> {
    const waiting = await db.select({ publicId: orders.publicId, deploymentId: orders.deploymentId, startDate: orders.startDate })
      .from(orders)
      .where(and(eq(orders.status, "pending"), wordpressImportSql))
      .orderBy(asc(orders.deploymentId));
    let started = 0;
    const failed: { deploymentId: string; error: string }[] = [];
    for (const o of waiting) {
      try {
        await this.startMigrated(o.publicId, o.startDate > fromDate ? o.startDate : fromDate);
        started++;
      } catch (e) {
        failed.push({ deploymentId: o.deploymentId, error: e instanceof Error ? e.message : String(e) });
      }
    }
    return { started, failed };
  }

  // Terminal: cancel() has no reverse. activate()'s existing `if (c !== "waitlisted") throw`
  // guard already forbids reactivating a cancelled order — no separate check needed here.
  // Bypasses transition()/update() for the same reason activate() does: cancelDeliveries must
  // run in the SAME tx as the status flip (a crash between the two must roll back both), and
  // the lock must be taken before the pre-cancelled guard is evaluated (TOCTOU — see
  // skipDelivery in deliveries.service.ts for the same shape).
  async cancel(publicId: string): Promise<void> {
    const actorId = await this.currentUserId();
    let cancelledRows: Awaited<ReturnType<typeof cancelDeliveries>> = [];
    await db.transaction(async (tx) => {
      const [idRow] = await tx.select({ id: orders.id, userId: orders.userId }).from(orders)
        .where(eq(orders.publicId, publicId)).limit(1);
      if (!idRow) throw new NotFoundError(`Order not found: ${publicId}`);
      // Customer lock first, then the order lock: the order verifyPayment and @foundry/wallet take them.
      if (idRow.userId) await lockUser(tx, idRow.userId);
      await lockOrder(tx, idRow.id);

      const [order] = await tx.select().from(orders).where(eq(orders.id, idRow.id)).limit(1);
      if (!order) throw new NotFoundError(`Order not found: ${publicId}`);
      if (order.status === "cancelled") throw new ValidationError("Order is already cancelled");
      // Every tiffin on a completed plan is delivered; cancelling would void delivered rows.
      if (order.status === "completed") throw new ValidationError("This plan is over; there is nothing left to cancel");

      // Coins first (the customer lock is already held), same order as payment verify takes them.
      // Coins the order earned are taken back. If it was never paid, coins held for it go
      // straight back; a paid order's spent coins stay spent (money back is refundOrder).
      if (order.userId) {
        await reverseCoinAward(tx, {
          userId: order.userId,
          eventType: "order_activated",
          source: { type: "order", id: order.publicId },
        });
        await reverseReferral(tx, order);
        const paid = paidStatusOf((await orderPaymentStatuses(tx, [order.id])).get(order.id)) != null;
        if (!paid) await reverseCoinRedemption(tx, { userId: order.userId, orderId: order.id });
      }

      const [row] = await tx.update(orders).set({ status: "cancelled", updatedBy: actorId })
        .where(eq(orders.id, order.id)).returning();
      cancelledRows = await cancelDeliveries(tx, row.id);
      await tx.insert(orderActivities).values({
        orderId: row.id,
        type: "cancelled",
        fromStatus: order.status,
        toStatus: "cancelled",
        createdBy: actorId,
      });
      await clearLookOutOnEnd(tx, row.id, "order cancelled");
      await enqueueOrderNotice(tx, row.id, {
        event: "order_cancelled",
        title: "Your order was cancelled",
        body: "Order {code} has been cancelled.",
        dedupeKey: `order_cancelled:${row.publicId}`,
      });
    });
    // External API call, deliberately outside the tx — see walletService.award above for the
    // same reasoning: a synced stop OptimoRoute still has must not survive a cancelled order.
    await removeStopsBestEffort(cancelledRows);
  }

  async reassign(publicId: string, ownerId: string): Promise<void> {
    await assertReassignAllowed();
    const owner = await resolveAssignableOwner(ownerId);
    await this.update(publicId, { currentOwner: owner.id });
  }
}

export const ordersService = new OrdersService(new UpdatableRepository(db, orders, orders.publicId, orders.id));

export async function countMigratedWaiting(): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(orders)
    .where(and(eq(orders.status, "pending"), wordpressImportSql));
  return row?.n ?? 0;
}
