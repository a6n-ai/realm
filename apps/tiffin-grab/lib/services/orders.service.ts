import { generateCode, NotFoundError, ValidationError, phoneSchema, emailSchema } from "@realm/commons";
import { createLogger } from "@realm/commons/logger";
import type { Condition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import { BaseRepository, UpdatableRepository, conditionToSql, columnResolver } from "@realm/database";
import { and, asc, desc, eq, gt, ilike, isNull, ne, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { coupons, deliveries, deliveryFrequencies, mealSizes, orderActivities, orders, payments, plans, users } from "@/db/schema";
import { SessionBaseService, SessionUpdatableService } from "./session-service";
import type { SortState } from "@/lib/list/sort";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { priceSubscription, type PricingLine, type PricingSelections } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { couponsService } from "./coupons.service";
import { materializeDeliveries, pauseRange, resumeOrder as resumeOrderDeliveries } from "./deliveries.service";
import { ledgerService } from "./ledger.service";
import { provisionCustomerByPhone } from "./customers.service";
import { validateStartDate } from "./start-date";
import { walletService } from "./wallet.service";
import { assertReassignAllowed, resolveAssignableOwner } from "./reassign";

const log = createLogger("orders.service");

// A transaction handle (or the base db) — payments + their ledger credit are
// written inside the same tx as the order they settle.
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PaymentStatusValue = (typeof payments.status.enumValues)[number];
type PaymentMethodValue = (typeof payments.method.enumValues)[number];

// tx-aware payment recording: writes the payments row AND a matching ledger
// credit (type 'payment') in the same tx, so every recorded payment makes the
// customer's totalSpent real. Capture stays manual/simulated (no gateway).
export async function recordPayment(
  tx: Tx,
  input: {
    orderId: bigint;
    userId: bigint;
    amount: number;
    status?: PaymentStatusValue;
    method?: PaymentMethodValue;
    note?: string | null;
    createdBy?: bigint | null;
  },
): Promise<bigint> {
  const [pay] = await tx
    .insert(payments)
    .values({
      orderId: input.orderId,
      status: input.status ?? "simulated_paid",
      method: input.method ?? "simulated",
      amount: input.amount.toFixed(2),
      note: input.note ?? null,
      createdBy: input.createdBy ?? null,
    })
    .returning({ id: payments.id });
  await ledgerService.record(tx, {
    userId: input.userId,
    orderId: input.orderId,
    paymentId: pay.id,
    direction: "credit",
    type: "payment",
    amount: input.amount,
  });
  return pay.id;
}

export interface CreateOrderInput {
  selections: PricingSelections;
  planKey: string;
  contact: { fullName: string; phone: string; email?: string; addressLine: string; city: string; postalCode: string };
  // Internal users.id of the lead owner to carry onto the order (set by the
  // convert flow so the order inherits the inquiry's currentOwner). Null/omitted
  // for ordinary checkout.
  currentOwner?: bigint | null;
  // Customer-entered public coupon code. Re-resolved server-side here — never
  // trust a client-sent discount amount.
  couponCode?: string | null;
  // Staff-applied rep daily coupon: the code the actor owns plus the amount they
  // requested (clamped to the dual ceiling on the server). A requestedAmount that
  // arrives without a backing valid rep coupon owned by the actor is rejected.
  repCoupon?: { code: string; requestedAmount: number } | null;
}

export interface CreateOrderOptions {
  // Who performed the action — stamped as createdBy (the acting user's public_id).
  // For an agent order this is the staff member, NOT the order owner.
  actorId?: string | null;
  // The account the order belongs to (the owner's public_id). Set for a
  // logged-in customer's own checkout so the order attaches to their real
  // account regardless of the phone typed. Omitted for anonymous checkout and
  // agent orders, which resolve/provision the customer by phone.
  ownerUserId?: string | null;
}

// Resolve a user public_id (usr_…) to the internal bigint id. Returns null when
// the id is absent or doesn't match a user.
async function resolveUserId(
  tx: { select: typeof db.select },
  publicId: string | null | undefined,
): Promise<bigint | null> {
  if (!publicId) return null;
  const [row] = await tx.select({ id: users.id }).from(users).where(eq(users.publicId, publicId)).limit(1);
  return row?.id ?? null;
}

// The single authoritative order-creation path: prices server-side, attaches the
// order to the owner (provisioning a customer by phone when none is given), and
// writes the order + simulated payment in one tx. Used by the public checkout
// and the agent (convert) flow alike.
//
// The client speaks public_id: input.selections.mealSizeId is a meal size
// public_id, and opts.actorId/ownerUserId are user public_ids. createOrder
// resolves each to the internal bigint id before writing the FK columns, and
// returns the order's public_id (ord_…) — never a bigint.
export async function createOrder(
  input: CreateOrderInput,
  opts: CreateOrderOptions = {},
): Promise<{ deploymentId: string; publicId: string }> {
  const { actorId = null, ownerUserId = null } = opts;
  const snapshot = await loadCatalogSnapshot();

  const plan = snapshot.plans.find((p) => p.key === input.planKey);
  if (!plan) throw new ValidationError("Invalid plan");
  // Dish selection happens per-delivery after subscribing, not at checkout —
  // order.mealSlots is derived from the plan's own categories, never trusted
  // from the client-submitted selections.
  const mealSlots = Object.keys(plan.categoryCounts);
  if (mealSlots.length === 0) throw new ValidationError("At least one category is required");
  validateStartDate(input.selections.startDate, plan.allowedStartDays, new Date());
  const frequency = snapshot.frequencies.find((f) => f.key === input.selections.frequencyKey)!
  const pricingCatalog = buildPricingCatalog(snapshot, input.selections);
  // Base price (no discounts). Coupons are re-resolved server-side inside the tx
  // — where the owner/actor ids exist — then folded into the final total.
  const basePricing = priceSubscription(input.selections, pricingCatalog);
  const mealSize = snapshot.mealSizes.find((m) => m.publicId === input.selections.mealSizeId);
  if (!mealSize) throw new ValidationError("Invalid meal size");
  const zone = matchZone(input.contact.postalCode, snapshot.zones);
  const zoneRow = zone ? snapshot.zones.find((z) => z.name === zone.name) : undefined;

  const parsedPhone = phoneSchema().safeParse(input.contact.phone);
  if (!parsedPhone.success) throw new ValidationError("Enter a valid phone number");
  const phone = parsedPhone.data;
  let email: string | null = null;
  if (input.contact.email?.trim()) {
    const parsedEmail = emailSchema.safeParse(input.contact.email);
    if (!parsedEmail.success) throw new ValidationError("Enter a valid email");
    email = parsedEmail.data;
  }

  const deploymentId = generateCode("SUB", 6);

  const txResult = await db.transaction(async (tx) => {
    // Resolve the acting user and explicit owner public_ids to internal bigints.
    const createdBy = await resolveUserId(tx, actorId);
    const ownerId = await resolveUserId(tx, ownerUserId);

    // A logged-in customer's order attaches to their own account; anonymous and
    // agent orders resolve/provision the customer by phone.
    let userId = ownerId;
    if (!userId) {
      const [existing] = await tx.select({ id: users.id }).from(users).where(eq(users.phone, phone)).limit(1);
      userId = existing?.id ?? null;
    }
    if (!userId) {
      userId = await provisionCustomerByPhone(
        tx,
        { fullName: input.contact.fullName, phone, email },
        createdBy,
      );
    }
    if (!userId) throw new ValidationError("Could not resolve a customer for this order");

    // Server-side discount resolution. Both coupon kinds land as a single
    // adjustments[] line; the redemptions (row + ledger debit) are written
    // in-tx below once the order id exists. The client never sets the amount.
    const adjustments: PricingLine[] = [];
    const redemptions: { coupon: typeof coupons.$inferSelect; amount: number; redeemedBy: bigint | null }[] = [];

    if (input.repCoupon) {
      // Hard gate: a discount amount with no acting staff member is rejected.
      if (createdBy == null) throw new ValidationError("A rep discount requires an acting staff member");
      const line = await couponsService.validateRepCoupon(input.repCoupon.code, {
        subtotal: basePricing.subtotal,
        requestedAmount: input.repCoupon.requestedAmount,
        actorId: createdBy,
        planType: plan.planType,
        userId,
      });
      const coupon = await couponsService.findByCode(input.repCoupon.code);
      adjustments.push(line);
      redemptions.push({ coupon, amount: line.amount, redeemedBy: createdBy });
    }

    // Customer lane: the best valid combination of auto-apply coupons plus an
    // optional manual code, re-resolved server-side (never trusting a client
    // amount). resolveBestCoupons returns the winning set + each coupon row to
    // redeem; rep_daily coupons are excluded from this optimizer entirely.
    //
    // Rep-aware: when a rep coupon is also applied, an exclusive coupon could never
    // legally ride alongside it, so we ask for the best STACKABLE-only combo. This
    // picks the largest stackable discount that can combine with the rep lane,
    // rather than letting an exclusive win the global optimum and then discarding
    // it (which would leave the customer with rep + nothing).
    const best = await couponsService.resolveBestCoupons({
      subtotal: basePricing.subtotal,
      planType: plan.planType,
      userId,
      manualCode: input.couponCode,
      stackableOnly: !!input.repCoupon,
    });
    // A manual code that was explicitly entered but is invalid / expired /
    // ineligible fails the order with the reason — the auto set would otherwise
    // silently drop it. Auto-apply coupons never trigger this.
    if (input.couponCode && best.manualError) throw new ValidationError(best.manualError);

    // Stacking with the rep lane: a customer who *explicitly* typed an exclusive
    // code alongside a rep discount is always told they cannot combine (preserving
    // the documented one-rep + one-stackable rule) — regardless of whether that
    // exclusive would have won the optimizer. The code reaching here is valid +
    // eligible (an invalid/ineligible one already threw via manualError above), so
    // a non-stackable resolution means the customer asked for an illegal combo.
    if (input.repCoupon && input.couponCode?.trim()) {
      const manualCoupon = await couponsService.findByCode(input.couponCode.trim());
      if (!manualCoupon.stackable) {
        throw new ValidationError("This coupon cannot be combined with another discount");
      }
    }
    // best.redemptions already excludes exclusives when a rep coupon is present
    // (stackableOnly), so the kept customer set rides alongside the rep lane.
    // Re-distribute every kept line against the running remaining subtotal so the
    // summed redemption amounts (and their discount ledger debits) can never exceed
    // the order subtotal, even though the customer total is independently floored
    // at 0. Lines that clamp to 0 here are skipped so they don't burn a redemption.
    const customerSet = best.redemptions;
    for (const r of customerSet) {
      const priorDiscount = adjustments.reduce((sum, a) => sum + a.amount, 0);
      const remaining = Math.max(0, Math.round((basePricing.subtotal - priorDiscount + Number.EPSILON) * 100) / 100);
      const amount = Math.min(r.amount, remaining);
      if (amount <= 0) continue;
      adjustments.push({ label: `${r.coupon.name} (${r.coupon.code})`, amount });
      redemptions.push({ coupon: r.coupon, amount, redeemedBy: createdBy });
    }

    const pricing = adjustments.length
      ? priceSubscription(input.selections, pricingCatalog, adjustments)
      : basePricing;

    const status: OrderStatusValue = zoneRow ? "active" : "waitlisted";

    const [order] = await tx
      .insert(orders)
      .values({
        userId,
        planId: plan.id,
        mealSizeId: mealSize.id,
        frequencyId: frequency.id,
        persons: input.selections.persons,
        mealSlots,
        includeSaturday: input.selections.includeSaturday,
        includeSunday: input.selections.includeSunday,
        durationWeeks: input.selections.durationWeeks,
        startDate: input.selections.startDate,
        tiffinCount: pricing.tiffinCount,
        perTiffinPrice: pricing.perTiffinPrice.toFixed(2),
        pricingSnapshot: pricing,
        total: pricing.total.toFixed(2),
        status,
        deploymentId,
        zoneId: zoneRow?.id ?? null,
        fullName: input.contact.fullName,
        addressLine: input.contact.addressLine,
        city: input.contact.city,
        postalCode: input.contact.postalCode,
        currentOwner: input.currentOwner ?? null,
        createdBy,
      })
      .returning();

    // createOrder never calls activate() — an in-zone customer lands on "active"
    // directly here, so materialization must be hooked on both paths, not just
    // the waitlisted→active transition below.
    if (order.status === "active") await materializeDeliveries(tx, order);

    // Payment + matching ledger credit (the discounted total is what's paid).
    await recordPayment(tx, { orderId: order.id, userId, amount: pricing.total, createdBy });

    // Redeem each applied coupon: usage row, count bump, and discount ledger debit.
    for (const r of redemptions) {
      await couponsService.redeem(tx, {
        coupon: r.coupon,
        userId,
        orderId: order.id,
        redeemedBy: r.redeemedBy,
        amountApplied: r.amount,
        context: { subtotal: basePricing.subtotal, planType: plan.planType, kind: r.coupon.kind },
      });
    }

    // Seed the activity timeline so the order-detail Activity section isn't empty
    // until the first lifecycle action. Written in-tx via the raw insert because
    // createOrder is the documented exception to the audited service layer.
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "created",
      toStatus: status,
      createdBy,
    });

    return { deploymentId, publicId: order.publicId, awardUserId: status === "active" ? userId : null };
  });

  try {
    if (txResult.awardUserId != null) {
      await walletService.award(txResult.awardUserId, "order_activated", { type: "order", id: txResult.publicId });
    }
  } catch (e) {
    log.error({ err: e }, "wallet award on activation failed");
  }

  return { deploymentId: txResult.deploymentId, publicId: txResult.publicId };
}

export type OrderListRow = {
  publicId: string;
  deploymentId: string;
  fullName: string;
  city: string;
  planKey: string;
  status: string;
  startDate: string;
  total: string;
  createdAt: number;
  ownerId: string | null;
  ownerName: string | null;
};

export type OrderSortColumn = "name" | "deployment" | "status" | "start" | "total" | "created";

export async function listOrders(
  filter: {
    status?: string;
    search?: string;
    sort?: SortState<OrderSortColumn>;
  } = {},
): Promise<OrderListRow[]> {
  const conds = [];
  if (filter.status && filter.status !== "all") {
    conds.push(eq(orders.status, filter.status as typeof orders.status.enumValues[number]));
  }
  if (filter.search?.trim()) {
    const q = `%${filter.search.trim()}%`;
    conds.push(or(ilike(orders.fullName, q), ilike(orders.deploymentId, q)));
  }

  const sort = filter.sort ?? { column: "created", dir: "desc" };
  const SORT_COL = {
    name: orders.fullName,
    deployment: orders.deploymentId,
    status: orders.status,
    start: orders.startDate,
    total: orders.total,
    created: orders.createdAt,
  } as const;
  const col = SORT_COL[sort.column] ?? orders.createdAt;

  const rows = await db
    .select({
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
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(users, eq(orders.currentOwner, users.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
    .limit(500);
  return rows.map((r) => ({ ...r, ownerId: r.ownerId ?? null, ownerName: r.ownerName ?? null })) satisfies OrderListRow[];
}

// Server-side unified filters (Condition) + offset pagination + unpaginated
// total — mirrors inquiriesService.listForPipeline. All filterable facets
// (status/fullName/deploymentId/createdAt) live on the base `orders` table, so
// a plain columnResolver suffices (no FK subqueries). The rows query joins
// plans (inner, non-nullable FK — safe) and users (left, nullable
// currentOwner — display-only), but the count runs on the base `orders` table
// alone with the identical `where` so the nullable owner join can't inflate it.
export async function listOrdersPage(
  condition: Condition | undefined,
  page: PageRequest,
  sort: SortState<OrderSortColumn> = { column: "created", dir: "desc" },
): Promise<Page<OrderListRow>> {
  const where = conditionToSql(
    condition,
    columnResolver({
      status: orders.status,
      fullName: orders.fullName,
      deploymentId: orders.deploymentId,
      createdAt: orders.createdAt,
    }),
  );

  const SORT_COL = {
    name: orders.fullName,
    deployment: orders.deploymentId,
    status: orders.status,
    start: orders.startDate,
    total: orders.total,
    created: orders.createdAt,
  } as const;
  const col = SORT_COL[sort.column] ?? orders.createdAt;

  const rows = await db
    .select({
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
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .leftJoin(users, eq(orders.currentOwner, users.id))
    .where(where)
    .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
    .limit(page.size)
    .offset(page.page * page.size);

  const [{ count }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(orders)
    .where(where);

  const items = rows.map((r) => ({ ...r, ownerId: r.ownerId ?? null, ownerName: r.ownerName ?? null }));
  return { items, page: page.page, size: page.size, total: count };
}

export type OrderDetail = typeof orders.$inferSelect & {
  planName: string;
  planKey: string;
  frequencyKey: string;
  mealSizeName: string;
  payments: { publicId: string; amount: string; status: string }[];
};

export async function readOrder(publicId: string): Promise<OrderDetail> {
  const [row] = await db
    .select({
      order: orders,
      planName: plans.name,
      planKey: plans.key,
      frequencyKey: deliveryFrequencies.key,
      mealSizeName: mealSizes.name,
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .innerJoin(deliveryFrequencies, eq(orders.frequencyId, deliveryFrequencies.id))
    .innerJoin(mealSizes, eq(orders.mealSizeId, mealSizes.id))
    .where(eq(orders.publicId, publicId))
    .limit(1);
  if (!row) throw new NotFoundError("Order not found");
  const pays = await db
    .select({ publicId: payments.publicId, amount: payments.amount, status: payments.status })
    .from(payments)
    .where(eq(payments.orderId, row.order.id));
  return { ...row.order, planName: row.planName, planKey: row.planKey, frequencyKey: row.frequencyKey, mealSizeName: row.mealSizeName, payments: pays };
}

export async function listOrderActivities(orderId: bigint) {
  return db.select().from(orderActivities).where(eq(orderActivities.orderId, orderId)).orderBy(desc(orderActivities.createdAt));
}

type OrderStatusValue = (typeof orders.status.enumValues)[number];
type OrderActivityType = (typeof orderActivities.type.enumValues)[number];

// The order lifecycle is built on the shared commons abstractions: OrdersService
// extends the updatable entity service (inheriting read/update with managed-column
// stamping), and audit rows go through a BaseService create. A status change is a
// guarded update + an activity create — both stamped consistently (update →
// updatedBy/updatedAt, create → createdBy + public_id/created_at). Mirrors
// inquiries.service: the entity update and the activity create are sequential
// writes, since commons repositories each hold their own connection.
class OrdersService extends SessionUpdatableService<typeof orders> {
  private readonly activities = new SessionBaseService(
    new BaseRepository(db, orderActivities, orderActivities.publicId, orderActivities.id),
  );

  // Guarded status transition: validate the current status, update the entity
  // through the inherited service, then record the audit activity.
  private async transition(
    publicId: string,
    guard: (current: OrderStatusValue) => void,
    patch: Partial<typeof orders.$inferInsert>,
    activity: { type: OrderActivityType; toStatus: OrderStatusValue },
  ): Promise<void> {
    const order = await this.read(publicId);
    guard(order.status);
    await this.update(publicId, patch);
    await this.activities.create({
      orderId: order.id,
      type: activity.type,
      fromStatus: order.status,
      toStatus: activity.toStatus,
    });
  }

  async activate(publicId: string): Promise<void> {
    const order = await this.read(publicId);
    if (order.status !== "waitlisted") {
      throw new ValidationError(`Cannot activate an order that is ${order.status}`);
    }
    const actorId = await this.currentUserId();

    // Status flip + delivery materialization + activity log in one tx: if
    // materialization throws, the whole activation rolls back — the design
    // forbids an "active" order with zero delivery rows. Bypasses the audited
    // update()/transition() path for the same reason createOrder does (see its
    // comment above): those helpers aren't tx-aware, so a raw in-tx write is
    // the smaller change vs threading a tx through the shared service layer.
    const updated = await db.transaction(async (tx) => {
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
      await materializeDeliveries(tx, row);
      return row;
    });

    if (updated.userId != null) {
      try {
        await walletService.award(updated.userId, "order_activated", { type: "order", id: updated.publicId });
      } catch (e) {
        log.error({ err: e }, "wallet award on activation failed");
      }
    }
  }

  async cancel(publicId: string): Promise<void> {
    await this.transition(
      publicId,
      (c) => { if (c === "cancelled") throw new ValidationError("Order is already cancelled"); },
      { status: "cancelled" },
      { type: "cancelled", toStatus: "cancelled" },
    );
  }

  // Delegates the actual row-marking to pauseRange (which validates the window and does its own
  // locked, cutoff-aware update). The order flips to "paused" only if every future original ended
  // up paused — a window narrower than the subscription leaves the order "active" with some rows
  // paused and others still scheduled.
  async pause(publicId: string, window: { from: string; until: string }): Promise<void> {
    const order = await this.read(publicId);
    if (order.status !== "active") throw new ValidationError(`Cannot pause an order that is ${order.status}`);
    await pauseRange(publicId, window.from, window.until);

    const [remaining] = await db.select({ id: deliveries.id }).from(deliveries)
      .where(and(
        eq(deliveries.orderId, order.id),
        isNull(deliveries.makeupForDeliveryId),
        gt(deliveries.cutoffAt, Date.now()),
        ne(deliveries.status, "paused"),
      ))
      .limit(1);
    if (remaining) return;

    await this.update(publicId, { status: "paused" });
    await this.activities.create({
      orderId: order.id,
      type: "paused",
      fromStatus: order.status,
      toStatus: "paused",
    });
  }

  // Delegates to resumeOrderDeliveries (reverts future paused rows to scheduled) then always flips
  // the order back to "active" — the guard above already requires the order to be "paused".
  async resume(publicId: string): Promise<void> {
    const order = await this.read(publicId);
    if (order.status !== "paused") throw new ValidationError(`Cannot resume an order that is ${order.status}`);
    await resumeOrderDeliveries(publicId);
    await this.update(publicId, { status: "active" });
    await this.activities.create({
      orderId: order.id,
      type: "resumed",
      fromStatus: order.status,
      toStatus: "active",
    });
  }

  async reassign(publicId: string, ownerId: string): Promise<void> {
    await assertReassignAllowed();
    const owner = await resolveAssignableOwner(ownerId);
    await this.update(publicId, { currentOwner: owner.id });
  }
}

const ordersService = new OrdersService(new UpdatableRepository(db, orders, orders.publicId, orders.id));

export const activateOrder = (publicId: string): Promise<void> => ordersService.activate(publicId);
export const cancelOrder = (publicId: string): Promise<void> => ordersService.cancel(publicId);
export const pauseOrder = (publicId: string, window: { from: string; until: string }): Promise<void> =>
  ordersService.pause(publicId, window);
export const resumeOrder = (publicId: string): Promise<void> => ordersService.resume(publicId);
export const reassignOrder = (publicId: string, ownerId: string): Promise<void> =>
  ordersService.reassign(publicId, ownerId);
