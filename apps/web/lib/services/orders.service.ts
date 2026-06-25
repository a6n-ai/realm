import { generateCode, NotFoundError, ValidationError, phoneSchema, emailSchema } from "@tiffin/commons";
import { BaseRepository, UpdatableRepository } from "@tiffin/commons-drizzle";
import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/db/client";
import { deliveryFrequencies, mealSizes, orderActivities, orders, payments, plans, users } from "@/db/schema";
import { SessionBaseService, SessionUpdatableService } from "./session-service";
import type { SortState } from "@/lib/list/sort";
import { loadCatalogSnapshot } from "@/lib/catalog/load";
import { matchZone } from "@/lib/catalog/postal";
import { priceSubscription, type PricingSelections } from "@/lib/pricing";
import { buildPricingCatalog } from "@/lib/pricing/build-catalog";
import { provisionCustomerByPhone } from "./customers.service";
import { validateOrderSlots } from "./order-slots";
import { validateStartDate } from "./start-date";

export interface CreateOrderInput {
  selections: PricingSelections;
  planKey: string;
  contact: { fullName: string; phone: string; email?: string; addressLine: string; city: string; postalCode: string };
  // Internal users.id of the lead owner to carry onto the order (set by the
  // convert flow so the order inherits the inquiry's currentOwner). Null/omitted
  // for ordinary checkout.
  currentOwner?: bigint | null;
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
  validateOrderSlots(plan.planType, plan.offeredSlots, input.selections.mealSlots);
  validateStartDate(input.selections.startDate, plan.allowedStartDays, new Date());
  const frequency = snapshot.frequencies.find((f) => f.key === input.selections.frequencyKey)!
  const pricing = priceSubscription(input.selections, buildPricingCatalog(snapshot, input.selections));
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

  return db.transaction(async (tx) => {
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

    const status: OrderStatusValue = zoneRow ? "active" : "waitlisted";

    const [order] = await tx
      .insert(orders)
      .values({
        userId,
        planId: plan.id,
        mealSizeId: mealSize.id,
        frequencyId: frequency.id,
        persons: input.selections.persons,
        mealSlots: input.selections.mealSlots,
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
      .returning({ id: orders.id, publicId: orders.publicId });

    await tx.insert(payments).values({
      orderId: order.id,
      status: "simulated_paid",
      amount: pricing.total.toFixed(2),
      createdBy,
    });

    // Seed the activity timeline so the order-detail Activity section isn't empty
    // until the first lifecycle action. Written in-tx via the raw insert because
    // createOrder is the documented exception to the audited service layer.
    await tx.insert(orderActivities).values({
      orderId: order.id,
      type: "created",
      toStatus: status,
      createdBy,
    });

    return { deploymentId, publicId: order.publicId };
  });
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
    })
    .from(orders)
    .innerJoin(plans, eq(orders.planId, plans.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(sort.dir === "asc" ? asc(col) : desc(col))
    .limit(500);
  return rows satisfies OrderListRow[];
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
    await this.transition(
      publicId,
      (c) => { if (c !== "waitlisted") throw new ValidationError(`Cannot activate an order that is ${c}`); },
      { status: "active" },
      { type: "activated", toStatus: "active" },
    );
  }

  async cancel(publicId: string): Promise<void> {
    await this.transition(
      publicId,
      (c) => { if (c === "cancelled") throw new ValidationError("Order is already cancelled"); },
      { status: "cancelled" },
      { type: "cancelled", toStatus: "cancelled" },
    );
  }

  // async so the synchronous window validation surfaces as a rejected promise.
  async pause(publicId: string, window: { from: string; until: string }): Promise<void> {
    const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!isoDateRegex.test(window.from) || !isoDateRegex.test(window.until)) {
      throw new ValidationError("Pause dates must be ISO YYYY-MM-DD");
    }
    // Lexicographic comparison is valid because ISO-8601 dates sort correctly.
    if (window.from > window.until) throw new ValidationError("Pause start must be on or before pause end");
    await this.transition(
      publicId,
      (c) => { if (c !== "active") throw new ValidationError(`Cannot pause an order that is ${c}`); },
      { status: "paused", pausedFrom: window.from, pausedUntil: window.until },
      { type: "paused", toStatus: "paused" },
    );
  }

  async resume(publicId: string): Promise<void> {
    await this.transition(
      publicId,
      (c) => { if (c !== "paused") throw new ValidationError(`Cannot resume an order that is ${c}`); },
      { status: "active", pausedFrom: null, pausedUntil: null },
      { type: "resumed", toStatus: "active" },
    );
  }
}

const ordersService = new OrdersService(new UpdatableRepository(db, orders, orders.publicId, orders.id));

export const activateOrder = (publicId: string): Promise<void> => ordersService.activate(publicId);
export const cancelOrder = (publicId: string): Promise<void> => ordersService.cancel(publicId);
export const pauseOrder = (publicId: string, window: { from: string; until: string }): Promise<void> =>
  ordersService.pause(publicId, window);
export const resumeOrder = (publicId: string): Promise<void> => ordersService.resume(publicId);
