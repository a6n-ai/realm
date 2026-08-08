import { NotFoundError, ValidationError } from "@realm/commons";
import { createLogger } from "@realm/commons/logger";
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
import { employees, orders, payments, productTaxRates, products, taxRates } from "@/db/schema";
import { createCloverClient } from "@/lib/clover/client";
import {
  isPublicOrderingEnabled,
  PUBLIC_ORDERING_UNAVAILABLE_MESSAGE,
} from "@/lib/clover/public-ordering";
import { haversineKm } from "@/lib/delivery/distance";
import { resolveAddress } from "@/lib/delivery/resolve-address";
import { applyZonePricing } from "@/lib/delivery/zone-pricing";
import { matchZone, deliveryLimitKm } from "@/lib/delivery/zones";
import { getStoreOrigin, getZones } from "@/lib/delivery/zones.service";
import {
  createCheckoutSchema,
  payCheckoutSchema,
  quoteCartSchema,
  type CreateCheckoutInput,
  type PayCheckoutInput,
  type QuoteCartInput,
} from "@/lib/orders/checkout-schema";
import {
  resolveDiscounts,
  type AppliedDiscount,
  type DiscountRequest,
} from "@/lib/orders/discounts";
import { loadModifierGroupsByProduct, resolveSelectedModifiers } from "@/lib/orders/modifiers";
import { resolveSettlement } from "@/lib/orders/settlement";
import { computeTax, type TaxableLine, type TaxRateRow } from "@/lib/orders/tax";
import type { SortState } from "@/lib/list/sort";
import { isCloverInventoryConnected } from "@/lib/products/availability";
import { integrationsConfigStore } from "@/lib/services/integrations.service";
import { inventoryCatalogService } from "@/lib/services/inventory.service";
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
  quoteCartSchema,
  type CreateCheckoutInput,
  type PayCheckoutInput,
  type QuoteCartInput,
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
  /** All three are Clover's computed figures — what the card will actually be charged. */
  subtotal: number;
  tax: number;
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

export type CartQuoteResult = {
  subtotal: number;
  /** Forecast from the mirrored Clover tax rates. Clover re-prices at checkout. */
  tax: number;
  total: number;
  currency: "CAD";
  taxLines: { name: string; amount: number }[];
  discountAmount: number;
  discountLines: { name: string; amount: number }[];
  /** True when a code was typed and matched nothing live. Not an error. */
  invalidCode: boolean;
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

const log = createLogger("orders");

function money(n: number): string {
  return n.toFixed(2);
}

const centsToDollars = (cents: number) => cents / 100;

/**
 * Tax rates + per-product associations for the products in a cart.
 * Only active rates are considered — an inactivated rate is one Clover no longer
 * applies, and the catalog sync marks (never deletes) them.
 */
async function loadTaxContext(productIds: bigint[]): Promise<{
  rates: TaxRateRow[];
  rateIdsByProduct: Map<string, string[]>;
}> {
  const rateRows = await db
    .select({
      id: taxRates.id,
      cloverTaxRateId: taxRates.cloverTaxRateId,
      name: taxRates.name,
      rate: taxRates.rate,
      taxAmount: taxRates.taxAmount,
      isDefault: taxRates.isDefault,
    })
    .from(taxRates)
    .where(eq(taxRates.active, true));

  const cloverIdByLocalId = new Map<string, string>();
  const rates: TaxRateRow[] = [];
  for (const r of rateRows) {
    if (!r.cloverTaxRateId) continue;
    cloverIdByLocalId.set(r.id.toString(), r.cloverTaxRateId);
    rates.push({
      cloverTaxRateId: r.cloverTaxRateId,
      name: r.name,
      rate: r.rate,
      taxAmount: r.taxAmount,
      isDefault: r.isDefault,
    });
  }

  const rateIdsByProduct = new Map<string, string[]>();
  if (productIds.length) {
    const links = await db
      .select({ productId: productTaxRates.productId, taxRateId: productTaxRates.taxRateId })
      .from(productTaxRates)
      .where(inArray(productTaxRates.productId, productIds));
    for (const l of links) {
      const cloverId = cloverIdByLocalId.get(l.taxRateId.toString());
      if (!cloverId) continue;
      const key = l.productId.toString();
      rateIdsByProduct.set(key, [...(rateIdsByProduct.get(key) ?? []), cloverId]);
    }
  }

  return { rates, rateIdsByProduct };
}

type ProductRow = typeof products.$inferSelect;

/**
 * Server-price a cart: resolve every product and modifier from our Clover mirror
 * and total the lines. The browser only ever sends ids and quantities, so this is
 * the single place cart money is computed — both the live quote and the real
 * checkout go through it, which is what stops the quoted total from drifting from
 * the charged one.
 */
async function priceCart(items: CreateCheckoutInput["items"]): Promise<{
  lines: OrderPricingSnapshot["lines"];
  subtotal: number;
  byPublic: Map<string, ProductRow>;
}> {
  const publicIds = [...new Set(items.map((i) => i.productPublicId))];
  const productRows = await db
    .select()
    .from(products)
    .where(and(inArray(products.publicId, publicIds), eq(products.active, true)));

  const byPublic = new Map(productRows.map((p) => [p.publicId, p]));
  // Modifier prices come from our Clover mirror, never from the request — whatever
  // amount we send is what Clover bills, so a client-supplied price would be free money.
  const groupsByProduct = await loadModifierGroupsByProduct(productRows.map((p) => p.id));
  const lines: OrderPricingSnapshot["lines"] = [];

  for (const line of items) {
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
    const selected = resolveSelectedModifiers(
      product.name,
      groupsByProduct.get(product.id.toString()) ?? [],
      line.modifiers,
    );
    const modifierTotal = selected.reduce((s, m) => s + m.price, 0);

    lines.push({
      productPublicId: product.publicId,
      cloverItemId: product.cloverItemId,
      name: product.name,
      unitPrice,
      quantity: line.quantity,
      lineTotal: Number(money((unitPrice + modifierTotal) * line.quantity)),
      ...(selected.length ? { modifiers: selected } : {}),
    });
  }

  return { lines, subtotal: Number(money(lines.reduce((s, l) => s + l.lineTotal, 0))), byPublic };
}

/**
 * Local tax forecast for a priced cart, from the Clover tax rates we mirror on sync.
 * Never authoritative — Clover bills its own figure — but it is what lets the bag
 * show a tax line before we round-trip to Clover.
 */
async function forecastCartTax(
  lines: OrderPricingSnapshot["lines"],
  byPublic: Map<string, ProductRow>,
  discountAmount = 0,
) {
  const taxCtx = await loadTaxContext(lines.map((l) => byPublic.get(l.productPublicId)!.id));
  return computeTax(
    lines.map<TaxableLine>((l) => {
      const product = byPublic.get(l.productPublicId)!;
      return {
        lineTotal: l.lineTotal,
        quantity: l.quantity,
        useDefaultRates: product.cloverDefaultTaxRates ?? true,
        rateIds: taxCtx.rateIdsByProduct.get(product.id.toString()) ?? [],
      };
    }),
    taxCtx.rates,
    discountAmount,
  );
}

/**
 * Turn a discount request into money. The browser sends offer ids and a typed
 * code; every amount is re-derived here from the synced Clover rows.
 */
async function resolveCartDiscounts(request: DiscountRequest, subtotal: number) {
  if (!request.offerPublicIds.length && !request.code) {
    return { applied: [] as AppliedDiscount[], total: 0, invalidCode: false };
  }
  return resolveDiscounts(await inventoryCatalogService.discounts.listRedeemable(), request, subtotal);
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

  /**
   * Price a bag without creating anything: server prices, plus tax from the Clover
   * rates we mirror on sync. No Clover round-trip, so it is cheap enough to call on
   * every quantity change — and no discount, because fulfillment isn't chosen yet.
   */
  async quoteCart(input: QuoteCartInput): Promise<CartQuoteResult> {
    const parsed = quoteCartSchema.parse(input);
    const { lines, subtotal, byPublic } = await priceCart(parsed.items);
    const discounts = await resolveCartDiscounts(parsed.discounts, subtotal);
    // Clover applies discounts before tax, so the forecast has to as well or the
    // quoted tax will not match what the card is charged.
    const forecast = await forecastCartTax(lines, byPublic, discounts.total);
    return {
      subtotal,
      tax: forecast.tax,
      total: Number(money(subtotal - discounts.total + forecast.tax)),
      currency: "CAD",
      taxLines: forecast.perRate.map((r) => ({ name: r.name, amount: r.amount })),
      discountAmount: discounts.total,
      discountLines: discounts.applied.map((d) => ({ name: d.name, amount: d.amount })),
      invalidCode: discounts.invalidCode,
    };
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
        id: products.id,
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

    const orderable = rows
      .filter((r) => {
        if (!cloverConnected) return true;
        return r.cloverAvailable !== false;
      })
      .filter((r) => {
        if (!cloverConnected) return true;
        if (r.cloverStockQty == null) return true;
        return Number(r.cloverStockQty) > 0;
      });

    // Modifier groups drive the picker, so the catalog has to carry them.
    const groupsByProduct = await loadModifierGroupsByProduct(orderable.map((r) => r.id));

    return orderable.map((r) => ({
      publicId: r.publicId,
      name: r.name,
      description: r.description,
      category: r.category,
      price: Number(r.price),
      image: r.image,
      tags: r.tags,
      cloverItemId: r.cloverItemId,
      stockQty: r.cloverStockQty != null ? Number(r.cloverStockQty) : null,
      modifierGroups: groupsByProduct.get(r.id.toString()) ?? [],
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

    const { lines, subtotal, byPublic } = await priceCart(parsed.items);

    // Delivery is resolved server-side from a fresh geocode — the client only ever
    // supplies the typed address, never the tier or discount (see checkout-schema.ts).
    let fulfillment: "pickup" | "delivery_instant" | "delivery_scheduled" = "pickup";
    let deliveryAddress: string | null = null;
    let deliveryLat: number | null = null;
    let deliveryLng: number | null = null;
    let deliveryDistanceKm: number | null = null;
    let deliveryFee: number | null = null;
    let deliveryZoneId: bigint | null = null;
    let scheduledForMs: number | null = null;

    // Customer-claimed offers and coupons. They stack with the instant-delivery
    // discount below, and the combined stack is capped at the subtotal.
    const claimed = await resolveCartDiscounts(parsed.discounts, subtotal);
    const cloverDiscounts: { name: string; amount: number }[] = claimed.applied.map((d) => ({
      name: d.code ? `${d.name} (${d.code})` : d.name,
      amount: d.amount,
    }));
    let discountAmount = claimed.total;

    if (parsed.fulfillment.type === "delivery") {
      const [zones, origin] = await Promise.all([getZones(), getStoreOrigin()]);
      const resolved = await resolveAddress({
        placeId: parsed.fulfillment.placeId,
        address: parsed.fulfillment.address,
      });
      if (!resolved) {
        throw new ValidationError(
          "Couldn't find that delivery address — try adding city and postal code.",
        );
      }

      deliveryAddress = resolved.formattedAddress;
      deliveryLat = resolved.lat;
      deliveryLng = resolved.lng;
      deliveryDistanceKm = Number(
        haversineKm(origin.lat, origin.lng, resolved.lat, resolved.lng).toFixed(2),
      );

      const zone = matchZone(deliveryDistanceKm, zones);
      if (!zone) {
        const limit = deliveryLimitKm(zones);
        throw new ValidationError(
          limit == null
            ? "Delivery is unavailable right now — pickup is available."
            : `We don't deliver that far yet (${deliveryDistanceKm} km — we deliver up to ${limit} km). Pickup is available.`,
        );
      }

      if (subtotal < zone.minSubtotal) {
        throw new ValidationError(
          `Orders over $${zone.minSubtotal} required for delivery to that address.`,
        );
      }
      if (zone.requiresScheduling) {
        if (!parsed.fulfillment.scheduledFor) {
          throw new ValidationError("Pick a delivery time for that address.");
        }
        const scheduled = new Date(parsed.fulfillment.scheduledFor);
        if (Number.isNaN(scheduled.getTime()) || scheduled.getTime() <= Date.now()) {
          throw new ValidationError("Pick a delivery time in the future.");
        }
        scheduledForMs = scheduled.getTime();
      }

      fulfillment = zone.requiresScheduling ? "delivery_scheduled" : "delivery_instant";

      const { discountAmount: zoneOff, feeAmount } = applyZonePricing({ subtotal, zone });
      if (zoneOff > 0) {
        cloverDiscounts.push({ name: `${zone.name} delivery discount`, amount: zoneOff });
        discountAmount = Number(money(discountAmount + zoneOff));
      }
      deliveryFee = feeAmount;
      deliveryZoneId = zone.id ?? null;
    }

    // The discount has to reach Clover: `POST /v1/orders/{id}/pay` bills the Clover
    // order's total, so a discount that exists only locally is one we quote but
    // never actually give. Clover applies discounts before tax.
    const atomicInput = {
      lineItems: expandAtomicLineItems(
        lines.map((l) => ({
          itemId: l.cloverItemId,
          quantity: l.quantity,
          name: l.name,
          // `amount` is mandatory: Clover prices a modification at zero if you send
          // only the modifier id, so omitting it hands out free upgrades.
          modifications: (l.modifiers ?? []).map((m) => ({
            modifierId: m.cloverModifierId,
            name: m.name,
            amount: dollarsToCloverCents(m.price),
          })),
        })),
      ),
      ...(cloverDiscounts.length
        ? {
            // One Clover line per discount so the name shows on Register and the
            // receipt, rather than a single opaque deduction.
            discounts: cloverDiscounts.map((d) => ({
              name: d.name,
              amount: -dollarsToCloverCents(d.amount),
            })),
          }
        : {}),
    };
    // NEEDS_CONTEXT: a non-zero zone.feeAmount is priced and persisted below
    // (`deliveryFee`), but is NOT yet added to `atomicInput` as a Clover line —
    // `CloverAtomicLineItemInput` (packages/clover) requires a real inventory
    // `itemId`, and there is no Clover catalog item for "delivery fee" to
    // reference. Do not fabricate one here; either provision a real Clover
    // item and reference it, or extend the shared package with a price-only
    // ad-hoc line type. Today's only zone has feeAmount: 0, so this has no
    // live effect — but it means a future fee-bearing zone would be quoted
    // locally and NOT charged by Clover until this is wired up.

    // Local forecast, used only to detect drift — Clover's numbers are what get charged.
    const forecast = await forecastCartTax(lines, byPublic, discountAmount);

    // Clover is the authority on price and tax for `item: {id}` lines, so we ask it
    // what this cart actually costs before writing an order we might not be able to honour.
    let computed;
    try {
      computed = await client.checkoutAtomicOrder(atomicInput);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Clover could not price this order";
      throw new ValidationError(msg);
    }

    const subtotalCharged = centsToDollars(computed.subtotal);
    const tax = centsToDollars(computed.totalTaxAmount);
    const total = centsToDollars(computed.total);

    if (Math.abs(tax - forecast.tax) >= 0.01) {
      log.warn(
        { quotedTax: forecast.tax, cloverTax: tax, subtotal },
        "local tax forecast disagreed with Clover — charging Clover's figure",
      );
    }
    // Clover ignores our price override and bills the catalog price, so a drift here
    // means the customer was shown a stale price.
    if (Math.abs(subtotalCharged - subtotal) >= 0.01) {
      log.warn(
        { quotedSubtotal: subtotal, cloverSubtotal: subtotalCharged },
        "product price mirror is stale — Clover priced this cart differently",
      );
    }
    if (total <= 0) throw new ValidationError("Order total must be greater than zero");

    const snapshot: OrderPricingSnapshot = {
      currency: "CAD",
      lines,
      subtotal: subtotalCharged,
      tax,
      ...(discountAmount > 0 ? { discountAmount, discountLines: cloverDiscounts } : {}),
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
          deliveryFee: deliveryFee != null ? deliveryFee.toFixed(2) : null,
          deliveryZoneId,
          scheduledFor: scheduledForMs,
          subtotal: money(subtotalCharged),
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
            selectedModifiers: l.modifiers ?? [],
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
          memo: cloverDiscounts.map((d) => d.name).join(" + ") || "Discount",
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
    // Same cart and discount we priced above — `note` is kitchen text and carries no money.
    let cloverOrderId: string;
    try {
      const atomic = await client.createAtomicOrder({ ...atomicInput, note });
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
      subtotal: subtotalCharged,
      tax,
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
      // A settled-but-flagged payment is `pending_verification`, not `paid` — still the
      // payment that captured this order, so a repeat call must return it, not a blank.
      const captured =
        pays.find((p) => p.status === "paid") ??
        pays.find((p) => p.status === "pending_verification" && p.capturedAt != null);
      return {
        orderPublicId: order.publicId,
        status: "paid",
        paymentPublicId: captured?.publicId ?? "",
        cloverChargeId: captured?.cloverChargeId ?? null,
        total: captured ? Number(captured.amount) : Number(order.total),
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
      // This bills `order.total`, which since slice 2 is Clover's own computed total —
      // so both payment paths now charge the same figure rather than two different ones.
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
      return this.settlePaid(tx, order, payResult.chargeId ?? payResult.id, payResult.amount);
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
    let chargedCents: number | null = null;

    if (chargeId) {
      const charge = await client.getCharge(chargeId);
      cloverStatus = mapCloverRemoteToPaymentStatus({
        chargeStatus: charge.status,
        chargePaid: charge.paid,
      });
      chargeId = charge.id;
      chargedCents = charge.amount ?? null;
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
        chargedCents = ecom.amount ?? null;
        source = "ecommerce_order";
        if (cloverStatus === "awaiting_payment" && ecom.chargeId) {
          const charge = await client.getCharge(ecom.chargeId);
          cloverStatus = mapCloverRemoteToPaymentStatus({
            chargeStatus: charge.status,
            chargePaid: charge.paid,
          });
          chargeId = charge.id;
          chargedCents = charge.amount ?? null;
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
          chargedCents = pay.amount ?? null;
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

    const applied = await this.applyRemotePaymentStatus(
      order,
      cloverStatus,
      chargeId,
      chargedCents,
    );
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
        // Webhooks are the primary settlement path in production, so this is where
        // the charged-amount check earns its keep.
        let chargedCents: number | null = null;

        if (parsed.kind === "P") {
          const payment = await client.getPlatformPayment(parsed.id);
          chargeId = payment.id;
          chargedCents = payment.amount ?? null;
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
            chargedCents = pay.amount ?? null;
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

        const applied = await this.applyRemotePaymentStatus(
          order,
          cloverStatus,
          chargeId,
          chargedCents,
        );
        result.processed += 1;
        if (applied.outcome === "paid" && applied.changed) result.settled += 1;
        else if (applied.outcome === "failed" && applied.changed) result.failed += 1;
        else if (!applied.changed) result.skipped += 1;
      } catch (err) {
        // A settlement that throws is counted as `skipped`, which is indistinguishable
        // from an event we deliberately ignored — log it so the two can be told apart.
        log.error(
          { objectId: update.objectId, type: update.type, err },
          "Clover webhook update failed to apply",
        );
        result.skipped += 1;
      }
    }

    return result;
  }

  private async applyRemotePaymentStatus(
    order: OrderRow,
    cloverStatus: MappedCloverPaymentStatus,
    cloverChargeId: string | null,
    chargedCents?: number | null,
  ): Promise<{ changed: boolean; outcome: MappedCloverPaymentStatus | "unchanged" }> {
    if (cloverStatus === "paid") {
      if (order.status === "paid" || order.status === "fulfilled") {
        return { changed: false, outcome: "unchanged" };
      }
      await db.transaction(async (tx) => {
        await this.settlePaid(tx, order, cloverChargeId, chargedCents);
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

  /**
   * Mark an order paid. `chargedCents` is what Clover reported actually taking from
   * the card; when it disagrees with the order total we still settle (the money has
   * moved — refusing to record it would lose it) but flag the payment for review and
   * write an adjustment entry, so the ledger reflects reality rather than our quote.
   */
  private async settlePaid(
    tx: Tx,
    order: OrderRow,
    cloverChargeId: string | null,
    chargedCents?: number | null,
  ): Promise<CheckoutPayResult> {
    const now = Date.now();
    const settlement = resolveSettlement(Number(order.total), chargedCents);

    if (settlement.mismatch) {
      log.error(
        {
          orderPublicId: order.publicId,
          quotedTotal: Number(order.total),
          chargedCents,
          deltaCents: settlement.deltaCents,
          cloverChargeId,
        },
        "Clover charged an amount different from the order total — payment held for verification",
      );
    }

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
        // The card was charged either way; `pending_verification` is a staff signal,
        // not a claim that the money is still in flight.
        status: settlement.paymentStatus,
        capturedAt: now,
        cloverChargeId,
        method: "clover",
        amount: money(settlement.settledTotal),
      })
      .where(eq(payments.id, pay.id));

    await tx
      .update(orders)
      .set({ status: "paid", paidAt: now })
      .where(eq(orders.id, order.id));

    // Record what was actually taken, not what we quoted.
    await ledgerService.record(tx, {
      userId: order.userId,
      orderId: order.id,
      paymentId: pay.id,
      direction: "credit",
      type: "payment",
      amount: settlement.settledTotal,
      memo: `Clover charge ${cloverChargeId ?? "n/a"}`,
    });

    if (settlement.adjustmentDirection) {
      await ledgerService.record(tx, {
        userId: order.userId,
        orderId: order.id,
        paymentId: pay.id,
        direction: settlement.adjustmentDirection,
        type: "adjustment",
        amount: Math.abs(settlement.deltaCents) / 100,
        memo: `Charged ${money(settlement.settledTotal)} against a quoted total of ${money(Number(order.total))}`,
      });
    }

    return {
      orderPublicId: order.publicId,
      status: "paid",
      paymentPublicId: pay.publicId,
      cloverChargeId,
      total: settlement.settledTotal,
    };
  }
}

export const ordersService = new OrdersService(ordersRepository);
