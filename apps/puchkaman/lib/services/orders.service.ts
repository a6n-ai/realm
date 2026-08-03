import { NotFoundError, ValidationError } from "@realm/commons";
import type { Condition, FilterCondition } from "@realm/commons/model/condition";
import type { Page, PageRequest } from "@realm/commons/util/pagination";
import {
  cloverCheckoutSdkUrl,
  getCloverConnection,
  dollarsToCloverCents,
  expandAtomicLineItems,
  mapCloverRemoteToPaymentStatus,
  parseCloverWebhookObjectId,
  type CloverWebhookUpdate,
  type MappedCloverPaymentStatus,
} from "@realm/clover";
import { columnResolver, conditionToSql } from "@realm/database";
import { and, asc, eq, exists, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { employees, orders, payments, products } from "@/db/schema";
import { createCloverClient } from "@/lib/clover/client";
import {
  isPublicOrderingEnabled,
  PUBLIC_ORDERING_UNAVAILABLE_MESSAGE,
} from "@/lib/clover/public-ordering";
import {
  distanceFromStoreKm,
  INSTANT_DELIVERY_DISCOUNT_PCT,
  INSTANT_DELIVERY_RADIUS_KM,
  SCHEDULED_DELIVERY_MIN_SUBTOTAL,
} from "@/lib/delivery/distance";
import { geocodeAddress } from "@/lib/delivery/geocode";
import {
  createCheckoutSchema,
  payCheckoutSchema,
  type CreateCheckoutInput,
  type PayCheckoutInput,
} from "@/lib/orders/checkout-schema";
import type { SortState } from "@/lib/list/sort";
import { isCloverInventoryConnected } from "@/lib/products/availability";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { employeesRepository, type EmployeeRow } from "./employees.repository";
import { ledgerService } from "./ledger.service";
import {
  ordersRepository,
  type OrderListRow,
  type OrderPricingSnapshot,
  type OrderRow,
  type OrderSortColumn,
  type OrdersRepository,
  type PaymentRow,
} from "./orders.repository";
import { currentUserId, recordAudit, SessionUpdatableService } from "./session-service";

export type { OrderListRow, OrderSortColumn } from "./orders.repository";

export {
  createCheckoutSchema,
  payCheckoutSchema,
  type CreateCheckoutInput,
  type PayCheckoutInput,
} from "@/lib/orders/checkout-schema";

function resolveOrderFacet(f: FilterCondition) {
  if (f.field === "paymentStatus" || f.field === "paymentMethod") {
    const payWhere = columnResolver({
      paymentStatus: payments.status,
      paymentMethod: payments.method,
    })(f);
    if (!payWhere) return undefined;
    return exists(
      db
        .select({ one: sql`1` })
        .from(payments)
        .where(and(eq(payments.orderId, orders.id), payWhere)),
    );
  }
  return columnResolver({
    status: orders.status,
    createdAt: orders.createdAt,
    publicId: orders.publicId,
    customerName: orders.customerName,
    customerEmail: orders.customerEmail,
  })(f);
}

export type CheckoutCreateResult = {
  orderPublicId: string;
  cloverOrderId: string;
  total: number;
  currency: "CAD";
  customerEmail: string;
  pakmsKey: string;
  checkoutSdkUrl: string;
  environment: "sandbox" | "production";
  fulfillment: "pickup" | "delivery_instant" | "delivery_scheduled";
  discountAmount?: number;
  scheduledFor?: string;
};

export type CheckoutPayResult = {
  orderPublicId: string;
  status: "paid";
  paymentPublicId: string;
  cloverChargeId: string | null;
  total: number;
};

export type CheckPaymentStatusResult = {
  orderPublicId: string;
  orderStatus: OrderRow["status"];
  paymentStatus: PaymentRow["status"] | null;
  cloverStatus: MappedCloverPaymentStatus;
  changed: boolean;
  cloverChargeId: string | null;
  source: "charge" | "ecommerce_order" | "platform_order" | "platform_payment";
};

export type CloverWebhookHandleResult = {
  processed: number;
  settled: number;
  failed: number;
  skipped: number;
};

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

function money(n: number): string {
  return n.toFixed(2);
}

/**
 * Pickup orders + Clover Ecommerce settlement.
 * Extends SessionUpdatableService for order row updates (+ audit_log);
 * create/pay are transactional.
 */
class OrdersService extends SessionUpdatableService<typeof orders> {
  constructor(private readonly ordersRepo: OrdersRepository) {
    super(ordersRepo);
  }

  /** Active products available for pickup. Empty until Clover client-ready; then SoT rules apply. */
  async listOrderableCatalog() {
    if (!(await isPublicOrderingEnabled())) {
      return [];
    }

    const clover = await getCloverConnection(integrationsConfigStore);
    const cloverConnected = isCloverInventoryConnected(clover);

    const rows = await db
      .select({
        publicId: products.publicId,
        name: products.name,
        description: products.description,
        category: products.category,
        price: products.price,
        image: products.image,
        tags: products.tags,
        source: products.source,
        cloverItemId: products.cloverItemId,
        cloverStockQty: products.cloverStockQty,
        cloverAvailable: products.cloverAvailable,
      })
      .from(products)
      .where(
        cloverConnected
          ? and(eq(products.active, true), isNotNull(products.cloverItemId))
          : or(
              eq(products.active, true),
              and(eq(products.source, "uber_eats"), isNull(products.cloverItemId)),
            ),
      )
      .orderBy(asc(products.displayOrder), asc(products.name));

    return rows
      .filter((r) => {
        if (!cloverConnected) return true;
        return r.cloverAvailable !== false;
      })
      .filter((r) => {
        if (!cloverConnected) return true;
        if (r.cloverStockQty == null) return true;
        return Number(r.cloverStockQty) > 0;
      })
      .map((r) => ({
        publicId: r.publicId,
        name: r.name,
        description: r.description,
        category: r.category,
        price: Number(r.price),
        image: r.image,
        tags: r.tags,
        cloverItemId: r.cloverItemId,
        stockQty: r.cloverStockQty != null ? Number(r.cloverStockQty) : null,
      }));
  }

  async listAdmin(page = 0, size = 50): Promise<{ rows: OrderListRow[]; total: number }> {
    return this.ordersRepo.listRecent(size, page * size);
  }

  /** Admin filtered/sorted list (facet filters + DataTable). */
  async queryOrders(
    condition: Condition | undefined,
    page: PageRequest,
    sort: SortState<OrderSortColumn> = { column: "created", dir: "desc" },
  ): Promise<Page<OrderListRow>> {
    const where = conditionToSql(condition, resolveOrderFacet);
    return this.ordersRepo.queryPage(where, sort, page);
  }

  async getAdminDetail(publicId: string) {
    const order = await this.ordersRepo.findByPublicId(publicId);
    if (!order) throw new NotFoundError(`Order not found: ${publicId}`);
    const items = await this.ordersRepo.findItemsByOrderId(order.id);
    const pays = await this.ordersRepo.findPaymentsByOrderId(order.id);
    let assignedEmployee: EmployeeRow | null = null;
    if (order.assignedEmployeeId) {
      const [row] = await db
        .select()
        .from(employees)
        .where(eq(employees.id, order.assignedEmployeeId))
        .limit(1);
      assignedEmployee = row ?? null;
    }
    return { order, items, payments: pays, assignedEmployee };
  }

  /**
   * Assign (or clear) the Clover employee who owns this order on Register.
   * Updates local `assignedEmployeeId`, then Platform `employee` when linked.
   */
  async assignEmployee(
    orderPublicId: string,
    employeePublicId: string | null,
  ): Promise<{
    orderPublicId: string;
    assignedEmployee: { publicId: string; name: string; cloverEmployeeId: string } | null;
    syncedToClover: boolean;
  }> {
    const order = await this.ordersRepo.findByPublicId(orderPublicId);
    if (!order) throw new NotFoundError(`Order not found: ${orderPublicId}`);

    let employee: EmployeeRow | null = null;
    if (employeePublicId != null) {
      employee = await employeesRepository.findByPublicId(employeePublicId);
      if (!employee || !employee.active) {
        throw new ValidationError("Employee not found or inactive");
      }
      if (!employee.cloverEmployeeId) {
        throw new ValidationError("Employee is not linked to Clover — sync employees first");
      }
    }

    await this.ordersRepo.updateByPublicId(order.publicId, {
      assignedEmployeeId: employee?.id ?? null,
    });

    let syncedToClover = false;
    if (order.cloverOrderId) {
      const client = await createCloverClient();
      if (client) {
        await client.updatePlatformOrderEmployee(
          order.cloverOrderId,
          employee?.cloverEmployeeId ?? null,
        );
        syncedToClover = true;
      }
    }

    await recordAudit({
      entity: "orders",
      entityPublicId: order.publicId,
      operation: "update",
      changes: {
        _action: "order_assign_employee",
        employeePublicId: employee?.publicId ?? null,
        employeeName: employee?.name ?? null,
        syncedToClover,
      },
      createdBy: await currentUserId(),
    });

    return {
      orderPublicId: order.publicId,
      assignedEmployee: employee
        ? {
            publicId: employee.publicId,
            name: employee.name,
            cloverEmployeeId: employee.cloverEmployeeId!,
          }
        : null,
      syncedToClover,
    };
  }

  /**
   * Create local pending order (server-priced) + push atomic order to Clover POS.
   * Returns PAKMS key for iframe tokenization — never returns OAuth tokens.
   */
  async createCheckout(input: CreateCheckoutInput): Promise<CheckoutCreateResult> {
    const parsed = createCheckoutSchema.parse(input);
    const client = await createCloverClient();
    if (!client) {
      throw new ValidationError(PUBLIC_ORDERING_UNAVAILABLE_MESSAGE);
    }
    // Fail fast if Ecommerce / PAKMS isn't permitted before writing a local order.
    const pakms = await client.getPakmsApiKey();
    const environment = client.environment();

    const publicIds = [...new Set(parsed.items.map((i) => i.productPublicId))];
    const productRows = await db
      .select()
      .from(products)
      .where(and(inArray(products.publicId, publicIds), eq(products.active, true)));

    const byPublic = new Map(productRows.map((p) => [p.publicId, p]));
    const lines: OrderPricingSnapshot["lines"] = [];

    for (const line of parsed.items) {
      const product = byPublic.get(line.productPublicId);
      if (!product) {
        throw new ValidationError(`Product not available: ${line.productPublicId}`);
      }
      if (!product.cloverItemId) {
        throw new ValidationError(`Product not linked to Clover: ${product.name}`);
      }
      if (product.cloverAvailable === false) {
        throw new ValidationError(`Product unavailable: ${product.name}`);
      }
      if (product.cloverStockQty != null && Number(product.cloverStockQty) < line.quantity) {
        throw new ValidationError(`Insufficient stock for ${product.name}`);
      }
      const unitPrice = Number(product.price);
      if (!Number.isFinite(unitPrice) || unitPrice < 0) {
        throw new ValidationError(`Invalid price for ${product.name}`);
      }
      lines.push({
        productPublicId: product.publicId,
        cloverItemId: product.cloverItemId,
        name: product.name,
        unitPrice,
        quantity: line.quantity,
        lineTotal: Number(money(unitPrice * line.quantity)),
      });
    }

    const subtotal = Number(money(lines.reduce((s, l) => s + l.lineTotal, 0)));
    const tax = 0;

    // Delivery is resolved server-side from a fresh geocode — the client only ever
    // supplies the typed address, never the tier or discount (see checkout-schema.ts).
    let fulfillment: "pickup" | "delivery_instant" | "delivery_scheduled" = "pickup";
    let deliveryAddress: string | null = null;
    let deliveryLat: number | null = null;
    let deliveryLng: number | null = null;
    let deliveryDistanceKm: number | null = null;
    let scheduledForMs: number | null = null;
    let discountAmount = 0;

    if (parsed.fulfillment.type === "delivery") {
      const point = await geocodeAddress(parsed.fulfillment.address);
      if (!point) {
        throw new ValidationError("Couldn't find that delivery address — try adding city and postal code.");
      }
      deliveryAddress = parsed.fulfillment.address;
      deliveryLat = point.lat;
      deliveryLng = point.lng;
      deliveryDistanceKm = Number(distanceFromStoreKm(point.lat, point.lng).toFixed(2));

      if (deliveryDistanceKm <= INSTANT_DELIVERY_RADIUS_KM) {
        fulfillment = "delivery_instant";
        discountAmount = Number(money(subtotal * INSTANT_DELIVERY_DISCOUNT_PCT));
      } else {
        fulfillment = "delivery_scheduled";
        if (subtotal < SCHEDULED_DELIVERY_MIN_SUBTOTAL) {
          throw new ValidationError(
            `Orders over $${SCHEDULED_DELIVERY_MIN_SUBTOTAL} required for delivery outside ${INSTANT_DELIVERY_RADIUS_KM}km.`,
          );
        }
        if (!parsed.fulfillment.scheduledFor) {
          throw new ValidationError("Pick a delivery time — you're outside our instant-delivery zone.");
        }
        const scheduled = new Date(parsed.fulfillment.scheduledFor);
        if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= Date.now()) {
          throw new ValidationError("Pick a delivery time in the future.");
        }
        scheduledForMs = scheduled.getTime();
      }
    }

    const total = Number(money(subtotal - discountAmount + tax));
    if (total <= 0) throw new ValidationError("Order total must be greater than zero");

    const snapshot: OrderPricingSnapshot = {
      currency: "CAD",
      lines,
      subtotal,
      tax,
      ...(discountAmount > 0 ? { discountPct: INSTANT_DELIVERY_DISCOUNT_PCT, discountAmount } : {}),
      total,
    };

    const order = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(orders)
        .values({
          status: "pending",
          fulfillment,
          customerName: parsed.contact.name,
          customerEmail: parsed.contact.email.toLowerCase(),
          customerPhone: parsed.contact.phone ?? null,
          note: parsed.contact.note ?? null,
          deliveryAddress,
          deliveryLat: deliveryLat != null ? deliveryLat.toFixed(6) : null,
          deliveryLng: deliveryLng != null ? deliveryLng.toFixed(6) : null,
          deliveryDistanceKm: deliveryDistanceKm != null ? deliveryDistanceKm.toFixed(2) : null,
          scheduledFor: scheduledForMs,
          subtotal: money(subtotal),
          tax: money(tax),
          total: money(total),
          pricingSnapshot: snapshot,
        })
        .returning();

      await this.ordersRepo.insertItems(
        tx,
        lines.map((l) => {
          const product = byPublic.get(l.productPublicId)!;
          return {
            orderId: row.id,
            productId: product.id,
            cloverItemId: l.cloverItemId,
            name: l.name,
            unitPrice: money(l.unitPrice),
            quantity: l.quantity,
            lineTotal: money(l.lineTotal),
          };
        }),
      );

      const [pay] = await tx
        .insert(payments)
        .values({
          orderId: row.id,
          status: "awaiting_payment",
          method: "clover",
          amount: money(total),
        })
        .returning();

      if (discountAmount > 0) {
        await ledgerService.record(tx, {
          orderId: row.id,
          paymentId: pay.id,
          direction: "debit",
          type: "discount",
          amount: discountAmount,
          memo: `${(INSTANT_DELIVERY_DISCOUNT_PCT * 100).toFixed(0)}% instant delivery discount`,
        });
      }

      return row;
    });

    // Kitchen-visible note — delivery orders have no Clover order-type config, so this
    // is how staff on Register see it's not a walk-in pickup.
    const note =
      fulfillment === "delivery_instant"
        ? `Web delivery (instant) · ${parsed.contact.name} · ${deliveryAddress}`
        : fulfillment === "delivery_scheduled"
          ? `Web delivery (scheduled ${new Date(scheduledForMs!).toLocaleString("en-CA", { timeZone: "America/Toronto" })}) · ${parsed.contact.name} · ${deliveryAddress}`
          : `Web pickup · ${parsed.contact.name}`;

    // Push to Clover after local commit so we can fail the order if POS create fails.
    let cloverOrderId: string;
    try {
      const atomic = await client.createAtomicOrder({
        lineItems: expandAtomicLineItems(
          lines.map((l) => ({
            itemId: l.cloverItemId,
            quantity: l.quantity,
            name: l.name,
            priceCents: dollarsToCloverCents(l.unitPrice),
          })),
        ),
        note,
      });
      cloverOrderId = atomic.id;
      await this.ordersRepo.updateByPublicId(order.publicId, { cloverOrderId });
    } catch (err) {
      await this.ordersRepo.updateByPublicId(order.publicId, { status: "failed" });
      const msg = err instanceof Error ? err.message : "Clover order create failed";
      throw new ValidationError(msg);
    }

    return {
      orderPublicId: order.publicId,
      cloverOrderId,
      total,
      currency: "CAD",
      customerEmail: order.customerEmail,
      pakmsKey: pakms.apiAccessKey,
      checkoutSdkUrl: cloverCheckoutSdkUrl(environment),
      environment,
      fulfillment,
      ...(discountAmount > 0 ? { discountAmount } : {}),
      ...(scheduledForMs != null ? { scheduledFor: new Date(scheduledForMs).toISOString() } : {}),
    };
  }

  /**
   * Pay Clover order with tokenized source, then mark local payment + ledger paid.
   * Totals come from the stored order — never from the client.
   */
  async payCheckout(input: PayCheckoutInput): Promise<CheckoutPayResult> {
    const parsed = payCheckoutSchema.parse(input);
    const client = await createCloverClient();
    if (!client) {
      throw new ValidationError(PUBLIC_ORDERING_UNAVAILABLE_MESSAGE);
    }

    const order = await this.ordersRepo.findByPublicId(parsed.orderPublicId);
    if (!order) throw new NotFoundError(`Order not found: ${parsed.orderPublicId}`);
    if (order.status === "paid") {
      const pays = await this.ordersRepo.findPaymentsByOrderId(order.id);
      const paid = pays.find((p) => p.status === "paid");
      return {
        orderPublicId: order.publicId,
        status: "paid",
        paymentPublicId: paid?.publicId ?? "",
        cloverChargeId: paid?.cloverChargeId ?? null,
        total: Number(order.total),
      };
    }
    if (order.status !== "pending") {
      throw new ValidationError(`Order cannot be paid (status: ${order.status})`);
    }
    if (!order.cloverOrderId) {
      throw new ValidationError("Order is missing Clover order id");
    }

    let payResult;
    try {
      payResult = await client.payOrder({
        orderId: order.cloverOrderId,
        source: parsed.source,
        email: order.customerEmail,
        clientIp: parsed.clientIp ?? undefined,
        currency: "cad",
      });
    } catch (err) {
      // Fallback: some merchants pay via charge when atomic order isn't on Ecommerce yet.
      try {
        const charge = await client.createCharge({
          amountCents: dollarsToCloverCents(Number(order.total)),
          currency: "cad",
          source: parsed.source,
          email: order.customerEmail,
          clientIp: parsed.clientIp ?? undefined,
          orderId: order.cloverOrderId,
        });
        payResult = {
          id: order.cloverOrderId,
          status: charge.status ?? "paid",
          chargeId: charge.id,
          amount: charge.amount,
          currency: charge.currency,
          raw: charge.raw,
        };
      } catch (chargeErr) {
        const msg =
          chargeErr instanceof Error
            ? chargeErr.message
            : err instanceof Error
              ? err.message
              : "Payment failed";
        throw new ValidationError(msg);
      }
    }

    return db.transaction(async (tx) => {
      return this.settlePaid(tx, order, payResult.chargeId ?? payResult.id);
    });
  }

  /**
   * Admin / fallback: pull live Clover status and sync local payment + order
   * (+ ledger credit once if newly paid).
   */
  async checkPaymentStatus(orderPublicId: string): Promise<CheckPaymentStatusResult> {
    const order = await this.ordersRepo.findByPublicId(orderPublicId);
    if (!order) throw new NotFoundError(`Order not found: ${orderPublicId}`);

    const client = await createCloverClient();
    if (!client) throw new ValidationError("Clover is not connected");

    const pays = await this.ordersRepo.findPaymentsByOrderId(order.id);
    const primary =
      pays.find((p) => p.status === "awaiting_payment" || p.status === "pending_verification") ??
      pays.find((p) => p.status === "paid") ??
      pays[0] ??
      null;

    let cloverStatus: MappedCloverPaymentStatus = "awaiting_payment";
    let chargeId = primary?.cloverChargeId ?? null;
    let source: CheckPaymentStatusResult["source"] = "platform_order";

    if (chargeId) {
      const charge = await client.getCharge(chargeId);
      cloverStatus = mapCloverRemoteToPaymentStatus({
        chargeStatus: charge.status,
        chargePaid: charge.paid,
      });
      chargeId = charge.id;
      source = "charge";
    } else if (order.cloverOrderId) {
      // Prefer Ecommerce order (charge linkage), fall back to Platform order + payments.
      try {
        const ecom = await client.getEcommerceOrder(order.cloverOrderId);
        cloverStatus = mapCloverRemoteToPaymentStatus({
          orderStatus: ecom.status,
          orderPaid: ecom.paid,
        });
        if (ecom.chargeId) chargeId = ecom.chargeId;
        source = "ecommerce_order";
        if (cloverStatus === "awaiting_payment" && ecom.chargeId) {
          const charge = await client.getCharge(ecom.chargeId);
          cloverStatus = mapCloverRemoteToPaymentStatus({
            chargeStatus: charge.status,
            chargePaid: charge.paid,
          });
          chargeId = charge.id;
          source = "charge";
        }
      } catch {
        const platform = await client.getPlatformOrder(order.cloverOrderId, {
          expand: "payments",
        });
        let paymentResult: string | undefined;
        if (platform.paymentIds[0]) {
          const pay = await client.getPlatformPayment(platform.paymentIds[0]!);
          paymentResult = pay.result;
          chargeId = chargeId ?? pay.id;
          source = "platform_payment";
        } else {
          source = "platform_order";
        }
        cloverStatus = mapCloverRemoteToPaymentStatus({
          paymentState: platform.paymentState,
          paymentResult,
        });
      }
    } else {
      throw new ValidationError("Order has no Clover order or charge id to check");
    }

    const applied = await this.applyRemotePaymentStatus(order, cloverStatus, chargeId);
    const refreshed = await this.ordersRepo.findByPublicId(order.publicId);
    const refreshedPays = refreshed
      ? await this.ordersRepo.findPaymentsByOrderId(refreshed.id)
      : pays;
    const refreshedPrimary =
      refreshedPays.find((p) => p.status === "paid") ??
      refreshedPays.find((p) => p.status === "failed") ??
      refreshedPays[0] ??
      null;

    await recordAudit({
      entity: "orders",
      entityPublicId: order.publicId,
      operation: "update",
      changes: {
        _action: "payment_check_status",
        cloverStatus,
        changed: applied.changed,
        source,
        cloverChargeId: refreshedPrimary?.cloverChargeId ?? chargeId,
      },
      createdBy: await currentUserId(),
    });

    return {
      orderPublicId: order.publicId,
      orderStatus: refreshed?.status ?? order.status,
      paymentStatus: refreshedPrimary?.status ?? null,
      cloverStatus,
      changed: applied.changed,
      cloverChargeId: refreshedPrimary?.cloverChargeId ?? chargeId,
      source,
    };
  }

  /**
   * App webhook updates (`P:` / `O:`). Fetches live object then applies settlement.
   * Idempotent — safe under Clover retries.
   */
  async handleCloverWebhookUpdates(
    updates: CloverWebhookUpdate[],
  ): Promise<CloverWebhookHandleResult> {
    const result: CloverWebhookHandleResult = {
      processed: 0,
      settled: 0,
      failed: 0,
      skipped: 0,
    };
    const client = await createCloverClient();
    if (!client) {
      result.skipped = updates.length;
      return result;
    }

    for (const update of updates) {
      const parsed = parseCloverWebhookObjectId(update.objectId);
      if (!parsed || (parsed.kind !== "P" && parsed.kind !== "O")) {
        result.skipped += 1;
        continue;
      }
      if (update.type === "DELETE") {
        result.skipped += 1;
        continue;
      }

      try {
        let order: OrderRow | null = null;
        let cloverStatus: MappedCloverPaymentStatus = "awaiting_payment";
        let chargeId: string | null = null;

        if (parsed.kind === "P") {
          const payment = await client.getPlatformPayment(parsed.id);
          chargeId = payment.id;
          cloverStatus = mapCloverRemoteToPaymentStatus({ paymentResult: payment.result });
          if (payment.orderId) {
            order = await this.ordersRepo.findByCloverOrderId(payment.orderId);
          }
          if (!order) {
            order = await this.ordersRepo.findOrderByCloverChargeId(parsed.id);
          }
        } else {
          order = await this.ordersRepo.findByCloverOrderId(parsed.id);
          if (!order) {
            result.skipped += 1;
            continue;
          }
          const platform = await client.getPlatformOrder(parsed.id, { expand: "payments" });
          let paymentResult: string | undefined;
          if (platform.paymentIds[0]) {
            const pay = await client.getPlatformPayment(platform.paymentIds[0]!);
            paymentResult = pay.result;
            chargeId = pay.id;
          }
          cloverStatus = mapCloverRemoteToPaymentStatus({
            paymentState: platform.paymentState,
            paymentResult,
          });
        }

        if (!order) {
          result.skipped += 1;
          continue;
        }

        const applied = await this.applyRemotePaymentStatus(order, cloverStatus, chargeId);
        result.processed += 1;
        if (applied.outcome === "paid" && applied.changed) result.settled += 1;
        else if (applied.outcome === "failed" && applied.changed) result.failed += 1;
        else if (!applied.changed) result.skipped += 1;
      } catch {
        result.skipped += 1;
      }
    }

    return result;
  }

  private async applyRemotePaymentStatus(
    order: OrderRow,
    cloverStatus: MappedCloverPaymentStatus,
    cloverChargeId: string | null,
  ): Promise<{ changed: boolean; outcome: MappedCloverPaymentStatus | "unchanged" }> {
    if (cloverStatus === "paid") {
      if (order.status === "paid" || order.status === "fulfilled") {
        return { changed: false, outcome: "unchanged" };
      }
      await db.transaction(async (tx) => {
        await this.settlePaid(tx, order, cloverChargeId);
      });
      return { changed: true, outcome: "paid" };
    }

    if (cloverStatus === "failed") {
      const changed = await db.transaction(async (tx) => {
        return this.markPaymentFailed(tx, order, cloverChargeId);
      });
      return { changed, outcome: changed ? "failed" : "unchanged" };
    }

    return { changed: false, outcome: "unchanged" };
  }

  private async markPaymentFailed(
    tx: Tx,
    order: OrderRow,
    cloverChargeId: string | null,
  ): Promise<boolean> {
    if (order.status === "paid" || order.status === "fulfilled") return false;

    const [pay] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.orderId, order.id),
          inArray(payments.status, ["awaiting_payment", "pending_verification"]),
        ),
      )
      .limit(1);

    if (!pay) return false;

    await tx
      .update(payments)
      .set({
        status: "failed",
        cloverChargeId: cloverChargeId ?? pay.cloverChargeId,
        method: "clover",
      })
      .where(eq(payments.id, pay.id));

    if (order.status === "pending") {
      await tx.update(orders).set({ status: "failed" }).where(eq(orders.id, order.id));
    }
    return true;
  }

  private async settlePaid(
    tx: Tx,
    order: OrderRow,
    cloverChargeId: string | null,
  ): Promise<CheckoutPayResult> {
    const now = Date.now();
    const [pay] = await tx
      .select()
      .from(payments)
      .where(
        and(
          eq(payments.orderId, order.id),
          inArray(payments.status, ["awaiting_payment", "pending_verification"]),
        ),
      )
      .limit(1);

    if (!pay) {
      // Already settled race — idempotent return
      const [existing] = await tx
        .select()
        .from(payments)
        .where(and(eq(payments.orderId, order.id), eq(payments.status, "paid")))
        .limit(1);
      if (existing) {
        if (cloverChargeId && !existing.cloverChargeId) {
          await tx
            .update(payments)
            .set({ cloverChargeId })
            .where(eq(payments.id, existing.id));
        }
        return {
          orderPublicId: order.publicId,
          status: "paid",
          paymentPublicId: existing.publicId,
          cloverChargeId: cloverChargeId ?? existing.cloverChargeId,
          total: Number(order.total),
        };
      }
      throw new ValidationError("No awaiting payment for this order");
    }

    await tx
      .update(payments)
      .set({
        status: "paid",
        capturedAt: now,
        cloverChargeId,
        method: "clover",
      })
      .where(eq(payments.id, pay.id));

    await tx
      .update(orders)
      .set({ status: "paid", paidAt: now })
      .where(eq(orders.id, order.id));

    await ledgerService.record(tx, {
      userId: order.userId,
      orderId: order.id,
      paymentId: pay.id,
      direction: "credit",
      type: "payment",
      amount: Number(order.total),
      memo: `Clover charge ${cloverChargeId ?? "n/a"}`,
    });

    return {
      orderPublicId: order.publicId,
      status: "paid",
      paymentPublicId: pay.publicId,
      cloverChargeId,
      total: Number(order.total),
    };
  }
}

export const ordersService = new OrdersService(ordersRepository);
