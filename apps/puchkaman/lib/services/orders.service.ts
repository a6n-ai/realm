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
import { cookies } from "next/headers";
import { db } from "@/db/client";
import {
  employees,
  ledgerEntries,
  orders,
  payments,
  productTaxRates,
  products,
  taxRates,
  users,
  walletLedger,
} from "@/db/schema";
import { getSession } from "@/lib/auth/session";
import { CART_COOKIE } from "@/lib/cart/types";
import { createCloverClient } from "@/lib/clover/client";
import {
  isPublicOrderingEnabled,
  PUBLIC_ORDERING_UNAVAILABLE_MESSAGE,
} from "@/lib/clover/public-ordering";
import { resolveOrderOwner, upsertCustomer } from "@/lib/customers/upsert-customer";
import { enqueueNotification, enqueueStaff } from "@/lib/notifications/enqueue";
import { haversineKm } from "@/lib/delivery/distance";
import { resolveAddress } from "@/lib/delivery/resolve-address";
import { chooseDelivery } from "@/lib/delivery/choose-delivery";
import { scheduleWindowError } from "@/lib/delivery/schedule";
import { applyTypeDiscount, PICKUP_TYPE_KEY } from "@/lib/delivery/type-pricing";
import { getAllDeliveryTypes, getStoreOrigin, getZonesWithTypes } from "@/lib/delivery/zones.service";
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
import { integrationsConfigStore, resolveActingOrgId } from "@/lib/services/integrations.service";
import { inventoryCatalogService } from "@/lib/services/inventory.service";
import { markCartConverted } from "./carts.service";
import { employeesRepository, type EmployeeRow } from "./employees.repository";
import { ledgerService } from "./ledger.service";
import {
  commitCoinRedemption,
  lockAndQuoteCoinRedemption,
  reverseCoinRedemption,
  walletService,
} from "./wallet.service";
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
  /**
   * The server's actual coin decision — present whenever the request asked to
   * spend coins, regardless of outcome. This is what closes the gap a stale or
   * not-yet-landed quote preview leaves open: the client renders THIS, not a
   * prediction, so a customer can never submit a coin request and hear nothing
   * back about what happened to it.
   */
  coins: { requested: number; coinsSpent: number; applied: number; message: string | null } | null;
};

/** What a resume-payment link needs to remount the Clover pay step for an order. */
export type ResumableCheckout = {
  orderPublicId: string;
  cloverOrderId: string;
  total: number;
  currency: "CAD";
  pakmsKey: string;
  checkoutSdkUrl: string;
  environment: "sandbox" | "production";
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
  /**
   * Present only when the request asked to spend coins. `applied` is the exact
   * dollar figure folded into discountAmount/discountLines above — createCheckout
   * computes it with the same capRedemption call against the same remaining-subtotal
   * basis, so this number is never a preview of something the charge disagrees with.
   * `message` is set instead of silently applying $0 when the cap rounds the spend
   * away (a coarse rate against a small remainder, or an already fully-discounted cart).
   */
  coins: { requested: number; coinsSpent: number; applied: number; message: string | null } | null;
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
async function priceCart(
  items: CreateCheckoutInput["items"],
  orgId?: string | null,
): Promise<{
  lines: OrderPricingSnapshot["lines"];
  subtotal: number;
  byPublic: Map<string, ProductRow>;
}> {
  const publicIds = [...new Set(items.map((i) => i.productPublicId))];
  // Same org scope as listOrderableCatalog (null = shared across every
  // franchise, otherwise this org's own products) — without this, a line
  // item for another franchise's product would price and check out fine
  // even though it never appeared on this visitor's menu or catalog.
  const orgScope = orgId ? or(isNull(products.organizationId), eq(products.organizationId, orgId)) : undefined;
  const productRows = await db
    .select()
    .from(products)
    .where(and(inArray(products.publicId, publicIds), eq(products.active, true), orgScope));

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
 * The wallet that may fund a coin redemption on this checkout: the signed-in
 * customer's, and only theirs. Mirrors `resolveOrderOwner`'s ownership test
 * (role `user` + a matching row) so the wallet debited is always the wallet of
 * the account that ends up owning the order. A guest has no wallet, and a
 * staff member ordering on someone's behalf must not spend their own coins.
 */
async function sessionWalletUserId(
  session: Awaited<ReturnType<typeof getSession>>,
): Promise<bigint | null> {
  if (!session || session.user.role !== "user") return null;
  const [row] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.publicId, session.user.id))
    .limit(1);
  return row?.id ?? null;
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
    const orgId = await resolveActingOrgId();
    const { lines, subtotal, byPublic } = await priceCart(parsed.items, orgId);
    const discounts = await resolveCartDiscounts(parsed.discounts, subtotal);

    // Fold in the picked delivery option's discount so the quoted total matches
    // what createCheckout will charge. Without this the bag quoted a total that
    // ignored instant delivery's 15%, i.e. higher than the card is debited.
    // Only the key came from the client; the percentage is read here, and the
    // line is named exactly as order creation names it.
    const deliveryLines: { name: string; amount: number }[] = [];
    let deliveryOff = 0;
    if (parsed.deliveryTypeKey) {
      const type = (await getAllDeliveryTypes()).find(
        (t) => t.key === parsed.deliveryTypeKey && t.active,
      );
      if (type) {
        deliveryOff = applyTypeDiscount({ subtotal, type }).discountAmount;
        if (deliveryOff > 0) deliveryLines.push({ name: `${type.label} discount`, amount: deliveryOff });
      }
    }

    let discountTotal = Number(money(discounts.total + deliveryOff));

    // Coins, quoted with the exact function createCheckout commits with —
    // lockAndQuoteCoinRedemption, same cap basis (offers + delivery, still
    // undiscounted by coins), same balance check. This is what keeps the
    // number shown here from ever drifting from what gets charged.
    let coinsResult: CartQuoteResult["coins"] = null;
    if (parsed.coins) {
      const walletUserId = await sessionWalletUserId(await getSession());
      if (walletUserId === null) {
        throw new ValidationError("Sign in to spend coins on this order.");
      }
      const rate = await walletService.activeRate("CAD");
      const cap = Math.max(0, Number(money(subtotal - discountTotal - 0.01)));
      const quoted = await db.transaction((tx) =>
        lockAndQuoteCoinRedemption(tx, { userId: walletUserId, coins: parsed.coins!, rate, cap }),
      );
      coinsResult = {
        requested: parsed.coins,
        coinsSpent: quoted.coinsSpent,
        applied: quoted.currencyValue,
        message:
          quoted.currencyValue > 0
            ? null
            : cap <= 0
              ? "This order is already fully discounted — no coins needed."
              : "Not enough coins to shave anything off at the current rate.",
      };
      if (quoted.currencyValue > 0) {
        discountTotal = Number(money(discountTotal + quoted.currencyValue));
      }
    }

    // Clover applies discounts before tax, so the forecast has to as well or the
    // quoted tax will not match what the card is charged.
    const forecast = await forecastCartTax(lines, byPublic, discountTotal);
    return {
      subtotal,
      tax: forecast.tax,
      total: Number(money(subtotal - discountTotal + forecast.tax)),
      currency: "CAD",
      taxLines: forecast.perRate.map((r) => ({ name: r.name, amount: r.amount })),
      discountAmount: discountTotal,
      discountLines: [
        ...discounts.applied.map((d) => ({ name: d.name, amount: d.amount })),
        ...deliveryLines,
        ...(coinsResult && coinsResult.applied > 0 ? [{ name: "Coins", amount: coinsResult.applied }] : []),
      ],
      invalidCode: discounts.invalidCode,
      coins: coinsResult,
    };
  }

  /**
   * Balance for the checkout coin control. Server-only — walletService must never
   * reach a client component, so the page calls this and passes the plain number
   * down as a prop. `canRedeem` mirrors sessionWalletUserId's ownership rule: a
   * guest or a staff session has no spendable wallet here, same as createCheckout.
   */
  async getCheckoutWalletBalance(): Promise<{ canRedeem: boolean; balance: number }> {
    const walletUserId = await sessionWalletUserId(await getSession());
    if (walletUserId === null) return { canRedeem: false, balance: 0 };
    return { canRedeem: true, balance: await walletService.balance(walletUserId) };
  }

  /**
   * Active products available for pickup. Empty until Clover client-ready;
   * then SoT rules apply. orgId scopes to a franchise's own Clover-synced
   * rows plus any null-organizationId row (Uber items, unscoped).
   */
  async listOrderableCatalog(orgId?: string | null) {
    if (!(await isPublicOrderingEnabled())) {
      return [];
    }

    const clover = await getCloverConnection(integrationsConfigStore);
    const cloverConnected = isCloverInventoryConnected(clover);
    const orgScope = orgId ? or(isNull(products.organizationId), eq(products.organizationId, orgId)) : undefined;

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
        and(
          cloverConnected
            ? and(eq(products.active, true), isNotNull(products.cloverItemId))
            : or(
                eq(products.active, true),
                and(eq(products.source, "uber_eats"), isNull(products.cloverItemId)),
              ),
          orgScope,
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
  async createCheckout(
    input: CreateCheckoutInput,
    // AWS-resolved coordinates for the delivery address. The trust boundary is
    // the caller, not here: /api/checkout re-resolves this from the client's
    // placeId/address via @realm/places' resolveAndPersist() *before* calling
    // this method — it never forwards a client-supplied lat/lng. Not used for
    // distance/discount here, only stored for the map. Undefined/pickup orders
    // store null.
    resolvedDelivery?: { lat: number; lng: number } | null,
  ): Promise<CheckoutCreateResult> {
    const parsed = createCheckoutSchema.parse(input);
    // Same resolution createCloverClient() uses internally (resolveActingOrg)
    // — the order gets stamped to whichever franchise's Clover connection
    // actually priced and will fulfill it.
    const orgId = await resolveActingOrgId();
    const client = await createCloverClient();
    if (!client) {
      throw new ValidationError(PUBLIC_ORDERING_UNAVAILABLE_MESSAGE);
    }
    // Fail fast if Ecommerce / PAKMS isn't permitted before writing a local order.
    const pakms = await client.getPakmsApiKey();
    const environment = client.environment();

    const { lines, subtotal, byPublic } = await priceCart(parsed.items, orgId);

    // Delivery is resolved server-side from a fresh geocode — the client only ever
    // supplies the typed address, never the tier or discount (see checkout-schema.ts).
    let fulfillment: "pickup" | "delivery_instant" | "delivery_scheduled" = "pickup";
    let deliveryAddress: string | null = null;
    let deliveryDistanceKm: number | null = null;
    let deliveryTypeId: bigint | null = null;
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
      const [zones, origin] = await Promise.all([getZonesWithTypes(), getStoreOrigin()]);
      // Core bucket, not storage-licensed: the coordinates are used to derive
      // deliveryDistanceKm and then discarded, never written to a column.
      //
      // This is a second geocode of the same address: app/api/checkout/route.ts
      // separately calls resolveAndPersist (AWS-only) on the same address string
      // to get the lat/lng it stores for the map. Deliberate, not a bug — see
      // the comment there for the full tradeoff (different provider chains,
      // pricing path stays Google-first for zone-boundary compatibility, map
      // path stays AWS-only per the persist cost/legal ruling; unifying them
      // is out of scope for this fix).
      const resolved = await resolveAddress({
        placeId: parsed.fulfillment.placeId,
        address: parsed.fulfillment.address,
      });
      if (!resolved) {
        throw new ValidationError(
          "Couldn't find that delivery address — try adding city and postal code.",
        );
      }

      // Keep the customer's typed text (unit/apt numbers Google's formatter drops)
      // as the address of record; the resolved string is appended only to confirm
      // the match — couriers and kitchen staff need the typed unit number.
      deliveryAddress =
        parsed.fulfillment.address === resolved.formattedAddress
          ? resolved.formattedAddress
          : `${parsed.fulfillment.address} (${resolved.formattedAddress})`;
      deliveryDistanceKm = Number(
        haversineKm(origin.lat, origin.lng, resolved.lat, resolved.lng).toFixed(2),
      );

      // Re-derive what is genuinely offered here. The client sent only a key.
      const choice = chooseDelivery({
        distanceKm: deliveryDistanceKm,
        typeKey: parsed.fulfillment.deliveryTypeKey,
        zones,
        subtotal,
        scheduledFor: parsed.fulfillment.scheduledFor,
      });
      if (!choice.ok) throw new ValidationError(choice.message);
      const { type, zone } = choice;
      if (!zone.id) throw new ValidationError("Could not resolve a delivery zone for that address.");

      if (type.requiresSchedule) {
        // The form bounds the picker to the same window; this is the rule.
        const windowError = scheduleWindowError(parsed.fulfillment.scheduledFor!);
        if (windowError) throw new ValidationError(windowError);
        scheduledForMs = new Date(parsed.fulfillment.scheduledFor!).getTime();
      }

      fulfillment = type.requiresSchedule ? "delivery_scheduled" : "delivery_instant";

      const { discountAmount: typeOff } = applyTypeDiscount({ subtotal, type });
      if (typeOff > 0) {
        cloverDiscounts.push({ name: `${type.label} discount`, amount: typeOff });
        discountAmount = Number(money(discountAmount + typeOff));
      }

      if (!type.id) throw new ValidationError("Could not resolve a delivery type for that address.");
      deliveryTypeId = type.id;
      deliveryZoneId = zone.id;
    } else {
      // Pickup has its own delivery_types row and its own discount_pct. It used
      // to be read by nobody: applyTypeDiscount was reached only on the delivery
      // path, so a merchant who set a pickup discount in Settings watched it do
      // nothing while the card was charged the full amount.
      const pickupType = (await getAllDeliveryTypes()).find(
        (t) => t.key === PICKUP_TYPE_KEY && t.active,
      );
      if (pickupType) {
        const { discountAmount: pickupOff } = applyTypeDiscount({ subtotal, type: pickupType });
        if (pickupOff > 0) {
          cloverDiscounts.push({ name: `${pickupType.label} discount`, amount: pickupOff });
          discountAmount = Number(money(discountAmount + pickupOff));
        }
      }
    }

    // Everything above is discount money the `ledger_entries` write below owns.
    // The coin redemption gets its own `ledger_entries` row from
    // `commitCoinRedemption`, so it is deliberately excluded from these two —
    // folding it in would record the same dollars in that table twice.
    const nonCoinDiscountAmount = discountAmount;
    const nonCoinDiscountNames = cloverDiscounts.map((d) => d.name);

    const session = await getSession();

    // Coins become just another Clover discount line, for exactly the reason the
    // next comment gives: priced by Clover, billed by Clover. Quoting here (before
    // the Clover call) is what makes the amount knowable in time to send it.
    let redemption: { userId: bigint; coinsSpent: number; currencyValue: number } | null = null;
    // Captured whenever coins were requested, independent of outcome — this is
    // what the response carries back so "coins were dropped by the cap" is
    // never something only a landed preview could have told the customer.
    let coinsOutcome: CheckoutCreateResult["coins"] = null;
    if (parsed.coins) {
      const walletUserId = await sessionWalletUserId(session);
      // Loud, not silent: quietly charging full price for a checkout the customer
      // submitted expecting a coin discount is the worse failure.
      if (walletUserId === null) {
        throw new ValidationError("Sign in to spend coins on this order.");
      }
      const rate = await walletService.activeRate("CAD");
      // Cap against the subtotal still undiscounted, the same remainder the
      // coupon engine works from — minus a cent, because Clover's total must
      // stay above zero (createCheckout rejects total <= 0) and a zero-rated
      // cart has no tax to keep it there.
      const cap = Math.max(0, Number(money(subtotal - discountAmount - 0.01)));
      // Its own transaction: the user lock has to be taken and released before
      // the Clover round-trip, which must not happen inside the order txn.
      // `commitCoinRedemption` re-asserts the balance under its own locks, so
      // this quote is only an early, friendlier rejection.
      const quote = await db.transaction((tx) =>
        lockAndQuoteCoinRedemption(tx, { userId: walletUserId, coins: parsed.coins!, rate, cap }),
      );
      coinsOutcome = {
        requested: parsed.coins,
        coinsSpent: quote.coinsSpent,
        applied: quote.currencyValue,
        message:
          quote.currencyValue > 0
            ? null
            : cap <= 0
              ? "This order is already fully discounted — no coins needed."
              : "Not enough coins to shave anything off at the current rate.",
      };
      if (quote.currencyValue > 0) {
        redemption = { userId: walletUserId, ...quote };
        cloverDiscounts.push({ name: "Coins", amount: quote.currencyValue });
        discountAmount = Number(money(discountAmount + quote.currencyValue));
      }
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
      // Provisioned before the order so the row has an owner from the start.
      // A signed-in customer owns their order directly; a guest — or a staff
      // member ordering on someone's behalf — gets the credential-less row
      // upsertCustomer creates for the typed email.
      const customerId = await resolveOrderOwner(
        {
          email: parsed.contact.email,
          name: parsed.contact.name,
          phone: parsed.contact.phone ?? null,
          sessionUserPublicId: session?.user.id ?? null,
          sessionUserRole: session?.user.role ?? null,
        },
        {
          findByPublicId: async (publicId) => {
            const [row] = await tx
              .select({ id: users.id })
              .from(users)
              .where(eq(users.publicId, publicId))
              .limit(1);
            return row?.id ?? null;
          },
          upsertByEmail: (i) => upsertCustomer(tx, i),
        },
      );

      const [row] = await tx
        .insert(orders)
        .values({
          status: "pending",
          userId: customerId,
          fulfillment,
          customerName: parsed.contact.name,
          customerEmail: parsed.contact.email.toLowerCase(),
          customerPhone: parsed.contact.phone ?? null,
          note: parsed.contact.note ?? null,
          deliveryAddress,
          deliveryLat: resolvedDelivery?.lat != null ? resolvedDelivery.lat.toFixed(6) : null,
          deliveryLng: resolvedDelivery?.lng != null ? resolvedDelivery.lng.toFixed(6) : null,
          deliveryDistanceKm: deliveryDistanceKm != null ? deliveryDistanceKm.toFixed(2) : null,
          deliveryTypeId,
          deliveryZoneId,
          scheduledFor: scheduledForMs,
          subtotal: money(subtotalCharged),
          tax: money(tax),
          total: money(total),
          pricingSnapshot: snapshot,
          organizationId: orgId,
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

      if (nonCoinDiscountAmount > 0) {
        await ledgerService.record(tx, {
          orderId: row.id,
          paymentId: pay.id,
          direction: "debit",
          type: "discount",
          amount: nonCoinDiscountAmount,
          memo: nonCoinDiscountNames.join(" + ") || "Discount",
        });
      }

      // After the insert, so the debit and its discount row carry the real
      // order id — and after the quote, never before it: lock order across
      // every wallet path is user-then-order, and this takes the order lock.
      // Debited now rather than at settlement because the discount is already
      // committed to the Clover order and the customer pays the reduced price
      // immediately; a deferred debit could fail with the money already taken.
      if (redemption) {
        await commitCoinRedemption(tx, {
          userId: redemption.userId,
          coins: redemption.coinsSpent,
          currencyValue: redemption.currencyValue,
          orderId: row.id,
          memo: `checkout ${row.publicId}`,
        });
      }

      // Cart -> order handoff, inside the order transaction: a rolled-back order
      // must leave the cart live so recovery still reaches the customer.
      // `cookies()` throws outside a request context (direct/test callers), so a
      // missing cart cookie is treated the same as no cart at all.
      let cartId: string | null = null;
      try {
        cartId = (await cookies()).get(CART_COOKIE)?.value ?? null;
      } catch {
        cartId = null;
      }
      if (cartId) await markCartConverted(tx, cartId, row.id);

      // Same txn as the order insert: a receipt must never describe an order
      // that rolled back.
      await enqueueNotification(tx, {
        event: "order_placed",
        recipientId: customerId,
        title: "We got your order",
        body: `Order ${row.publicId}`,
        href: `/track?order=${row.publicId}`,
        data: {
          order: { publicId: row.publicId, total: String(row.total), name: parsed.contact.name },
        },
        dedupeKey: `${row.publicId}:order_placed`,
      });
      await enqueueStaff(tx, {
        event: "order_placed",
        title: "New order",
        body: `${parsed.contact.name} — ${row.publicId}`,
        href: `/dashboard/orders/${row.publicId}`,
        // Staff templates render from the same vars as the customer's. Omitting
        // `data` is silent: {{order.publicId}} interpolates to an empty string
        // rather than failing, so the notification just reads "Order ".
        data: {
          order: { publicId: row.publicId, total: String(row.total), name: parsed.contact.name },
        },
        dedupeKey: `${row.publicId}:order_placed:staff`,
      });

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

    // The order type is what makes Register announce a website order the way it
    // announces an Uber Eats / DoorDash one: those arrive tagged by their own
    // integration, and the tag is what drives the new-order alert and print
    // rules. An API order with no type lands silently in the Orders list, which
    // is why staff had to open the admin dashboard to notice one.
    //
    // Asked of the client, not re-read from the config store: the client already
    // holds the connection it authenticated with, and a second read would resolve
    // the acting org again. undefined when the merchant has not mapped a type yet,
    // which leaves Clover behaving exactly as before rather than failing checkout.
    const orderTypeId = client.webOrderTypeId(fulfillment);

    // Push to Clover after local commit so we can fail the order if POS create fails.
    // Same cart and discount we priced above — `note` is kitchen text and carries no money.
    let cloverOrderId: string;
    try {
      const atomic = await client.createAtomicOrder({
        ...atomicInput,
        note,
        ...(orderTypeId ? { orderTypeId } : {}),
      });
      cloverOrderId = atomic.id;
      await this.ordersRepo.updateByPublicId(order.publicId, { cloverOrderId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Clover order create failed";
      // The local tx already committed (and, if coins were spent, debited them)
      // before this POS push ran — give them back now that the order is dead.
      //
      // One transaction, not two: a crash between the status write and the
      // reversal used to leave a `failed` order holding an unreversed debit,
      // and the pending-order sweep only looks at `pending` orders, so those
      // coins were stranded forever. Reversal first so the lock order stays
      // user-then-order, matching every other wallet path.
      try {
        await db.transaction(async (tx) => {
          await this.reverseOrderRedemption(tx, order);
          await tx.update(orders).set({ status: "failed" }).where(eq(orders.id, order.id));
        });
      } catch (reverseErr) {
        // Must never replace the Clover error the caller has to see. The whole
        // transaction rolled back, so the order is still `pending` and the
        // sweep will find it — but say plainly that coins were not returned.
        log.error(
          { err: reverseErr, orderPublicId: order.publicId, cloverError: msg },
          "Clover order create failed and the coin redemption was NOT reversed — coins remain debited and the order was left pending for the sweep",
        );
      }
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
      coins: coinsOutcome,
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

    const result = await db.transaction(async (tx) => {
      return this.settlePaid(tx, order, payResult.chargeId ?? payResult.id, payResult.amount);
    });
    await this.awardOrderPaid(order);
    return result;
  }

  /**
   * Iframe config for paying an already-created order (the tracking page's
   * "pay balance"). Returns only the public PAKMS key and SDK URL — the same
   * pair `createCheckout` hands the checkout page, never an OAuth token.
   *
   * Nothing about the amount is returned or accepted: `payCheckout` charges the
   * Clover order total regardless of what any client believes it owes.
   */
  async getPaymentIframeConfig(
    orderPublicId: string,
  ): Promise<{ pakmsKey: string; checkoutSdkUrl: string }> {
    const order = await this.ordersRepo.findByPublicId(orderPublicId);
    if (!order) throw new NotFoundError(`Order not found: ${orderPublicId}`);

    const client = await createCloverClient();
    if (!client) throw new ValidationError(PUBLIC_ORDERING_UNAVAILABLE_MESSAGE);

    const pakms = await client.getPakmsApiKey();
    return {
      pakmsKey: pakms.apiAccessKey,
      checkoutSdkUrl: cloverCheckoutSdkUrl(client.environment()),
    };
  }

  /**
   * The resume-link payload: only for an order that has never been paid.
   * Returns null for anything else — paid, failed, cancelled, or no
   * `awaiting_payment` payment row — so the resume page can turn every one of
   * those into the same 404 rather than leaking which state the order is in.
   */
  async getResumableCheckout(orderPublicId: string): Promise<ResumableCheckout | null> {
    const order = await this.ordersRepo.findByPublicId(orderPublicId);
    if (!order || order.status !== "pending" || !order.cloverOrderId) return null;

    const pays = await this.ordersRepo.findPaymentsByOrderId(order.id);
    if (!pays.some((p) => p.status === "awaiting_payment")) return null;

    // A valid, unexpired HMAC resume token only ever reaches here via the link
    // this app mailed to order.customerEmail — landing on this page is proof of
    // inbox access, the same signal an email-verification link gives anywhere
    // else. upsertCustomer already treats emailVerified as "claimed" and stops
    // overwriting name/phone once it's set, so this is a free, real claim.
    if (order.userId) {
      await db
        .update(users)
        .set({ emailVerified: true })
        .where(and(eq(users.id, order.userId), eq(users.emailVerified, false)));
    }

    const client = await createCloverClient();
    if (!client) return null;

    const pakms = await client.getPakmsApiKey();
    const environment = client.environment();
    return {
      orderPublicId: order.publicId,
      cloverOrderId: order.cloverOrderId,
      total: Number(order.total),
      currency: "CAD",
      pakmsKey: pakms.apiAccessKey,
      checkoutSdkUrl: cloverCheckoutSdkUrl(environment),
      environment,
    };
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

  /**
   * Returns a redeemed order's coins now that it can never be paid. Coins were
   * debited at order creation (the discount was already committed to Clover),
   * so every terminal-failure path must call this — reverseCoinRedemption is
   * idempotent and a no-op for orders with no redemption, so it's safe to call
   * unconditionally rather than pre-checking whether coins were spent.
   *
   * Also mirrors the original "discount" ledger.entries debit with a credit
   * "adjustment" row: the discount row was written when this order looked
   * like a live sale, and Finance's Transactions/Ledger views need the money
   * side to say the discount never actually happened, same as the coin side.
   */
  private async reverseOrderRedemption(tx: Tx, order: OrderRow): Promise<void> {
    if (!order.userId) return; // no wallet owner, nothing to reverse
    const { coinsReturned } = await reverseCoinRedemption(tx, {
      userId: order.userId,
      orderId: order.id,
    });
    if (coinsReturned === 0) return;

    const [original] = await tx
      .select({ amount: ledgerEntries.amount })
      .from(ledgerEntries)
      .where(
        and(
          eq(ledgerEntries.orderId, order.id),
          eq(ledgerEntries.type, "discount"),
          eq(ledgerEntries.direction, "debit"),
          eq(ledgerEntries.memo, "coin redemption"),
        ),
      )
      .limit(1);
    if (!original) return;

    await ledgerService.record(tx, {
      userId: order.userId,
      orderId: order.id,
      direction: "credit",
      type: "adjustment",
      amount: original.amount,
      memo: `reverses coin redemption for ${order.publicId}`,
    });
  }

  /**
   * Terminalize an order nobody ever paid. One transaction, not two: a crash
   * between the reversal and the status write used to leave a `failed` order
   * holding an unreversed debit. User lock first, then the order re-read,
   * matching `markPaymentFailed`'s fixed user-then-order lock order —
   * `reverseOrderRedemption` reaches `reverseCoinRedemption`, which takes
   * user-then-order, so taking the order lock alone here would invert it.
   *
   * Returns false when the order is no longer `pending` — a settlement that
   * landed between this job's read and its write must win.
   */
  async abandonPendingOrder(orderId: bigint): Promise<boolean> {
    return db.transaction(async (tx) => {
      const [snapshot] = await tx.select().from(orders).where(eq(orders.id, orderId)).limit(1);
      if (!snapshot) return false;
      if (snapshot.userId) {
        await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${snapshot.userId} FOR UPDATE`);
      }
      const [fresh] = await tx.select().from(orders).where(eq(orders.id, orderId)).for("update").limit(1);
      if (!fresh || fresh.status !== "pending") return false;
      await this.reverseOrderRedemption(tx, fresh);
      await tx.update(orders).set({ status: "failed" }).where(eq(orders.id, orderId));
      return true;
    });
  }

  /**
   * Refuses to settle an order whose coin redemption has already been reversed.
   *
   * Coins are debited at order creation, so a terminal failure hands them back;
   * `assertNotAlreadyRedeemed` then makes re-debiting that order impossible
   * forever. But the Clover order still carries its `Coins` discount line and is
   * still payable, so a retry already in flight — or a FAILED→SUCCESS correction
   * — can settle it afterwards. Settling would ship $10 of goods for the $6 the
   * customer paid while they keep the coins too, and nothing downstream could
   * ever claw the discount back.
   *
   * So: throw, and alert staff in a transaction of its own that survives the
   * rollback. The customer may genuinely have paid, which is exactly why this
   * must not succeed quietly — but it must not fail quietly either. Refusing is
   * the fail-safe direction: no goods ship automatically, the order stays
   * `failed`, and a human reconciles the charge (refund it, or re-place the
   * order at full price). The webhook loop already logs a throwing settlement;
   * admin Check status surfaces the message directly.
   */
  private async assertRedemptionNotReversed(
    tx: Tx,
    order: OrderRow,
    cloverChargeId: string | null,
  ): Promise<void> {
    if (!order.userId) return; // no wallet owner, nothing could have been reversed
    const [reversal] = await tx
      .select({ id: walletLedger.id })
      .from(walletLedger)
      .where(
        and(
          eq(walletLedger.userId, order.userId),
          eq(walletLedger.sourceType, "redemption_reversal"),
          eq(walletLedger.sourceId, order.id.toString()),
        ),
      )
      .limit(1);
    if (!reversal) return;

    log.error(
      { orderPublicId: order.publicId, cloverChargeId, total: String(order.total) },
      "refusing to settle an order whose coin redemption was already reversed — the charge needs manual reconciliation",
    );
    // Own transaction: the throw below rolls `tx` back, and an alert nobody
    // ever sees is the same as no alert. The dedupeKey keeps webhook retries
    // from re-notifying on every redelivery.
    await db.transaction((alertTx) =>
      enqueueStaff(alertTx, {
        event: "payment_failed",
        title: "Payment landed on a refunded order",
        body: `${order.publicId} — coins were already returned; reconcile this charge manually`,
        href: `/dashboard/orders/${order.publicId}`,
        data: { order: { publicId: order.publicId, total: String(order.total) } },
        dedupeKey: `${order.publicId}:settle_after_reversal`,
      }),
    );
    throw new ValidationError(
      `Order ${order.publicId} cannot be settled: its coin redemption was already reversed. The charge needs manual reconciliation.`,
    );
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
      await this.awardOrderPaid(order);
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

    // `order` is a snapshot taken before two Clover HTTP round-trips. A
    // settlement landing in that window would slip past the stale check above —
    // and specifically the amount-mismatch case settles the payment as
    // `pending_verification`, which is still in the `pay` lookup below, so that
    // guard does not catch it either. The result was a *paid* order flipped to
    // `failed` with its coins refunded. Re-read under a row lock and decide
    // from that row, never from the snapshot.
    //
    // User lock first: reverseOrderRedemption takes user-then-order, so taking
    // the order lock alone here would invert the package's fixed lock order.
    if (order.userId) {
      await tx.execute(sql`SELECT id FROM ${users} WHERE id = ${order.userId} FOR UPDATE`);
    }
    const [fresh] = await tx
      .select()
      .from(orders)
      .where(eq(orders.id, order.id))
      .for("update")
      .limit(1);
    if (!fresh) return false;
    if (fresh.status === "paid" || fresh.status === "fulfilled") return false;

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

    if (fresh.status === "pending") {
      await this.reverseOrderRedemption(tx, order);
      await tx.update(orders).set({ status: "failed" }).where(eq(orders.id, order.id));
    }

    // Staff-only: a customer who just watched the card decline does not need an
    // email about it, and a failed charge is an operational signal.
    await enqueueStaff(tx, {
      event: "payment_failed",
      title: "Payment failed",
      body: order.publicId,
      href: `/dashboard/orders/${order.publicId}`,
      data: { order: { publicId: order.publicId, total: String(order.total) } },
      dedupeKey: `${order.publicId}:payment_failed:${cloverChargeId ?? "none"}`,
    });

    return true;
  }

  /**
   * Award `order_paid` coins once a settlement transaction has committed.
   * Deliberately outside settlePaid's transaction: walletService.award runs
   * against its own db handle (not the caller's `tx`), so it was never going
   * to be atomic with the settlement anyway — and the payment is already
   * committed by the time this runs, so a wallet failure must never risk it.
   * Guest orders (`order.userId` null) have nothing to award. The package's
   * unique index on (sourceType, sourceId, eventType) makes a repeat call
   * for the same order a no-op, so every settlePaid caller can call this
   * unconditionally without its own double-settlement guard.
   */
  private async awardOrderPaid(order: OrderRow): Promise<void> {
    if (!order.userId) return;
    try {
      await walletService.award(order.userId, "order_paid", { type: "order", id: order.publicId });
    } catch (err) {
      log.error({ err, orderPublicId: order.publicId }, "wallet award on payment settle failed");
    }
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
    await this.assertRedemptionNotReversed(tx, order, cloverChargeId);

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

    // The guard matters: orders placed before the customer backfill have no
    // owner, and enqueue would otherwise be handed an undefined recipient.
    if (order.userId) {
      await enqueueNotification(tx, {
        event: "order_paid",
        recipientId: order.userId,
        title: "Payment received",
        body: `Order ${order.publicId}`,
        href: `/track?order=${order.publicId}`,
        data: { order: { publicId: order.publicId, total: String(order.total) } },
        dedupeKey: `${order.publicId}:order_paid`,
      });
    }
    await enqueueStaff(tx, {
      event: "order_paid",
      title: "Order paid",
      body: order.publicId,
      href: `/dashboard/orders/${order.publicId}`,
      data: { order: { publicId: order.publicId, total: String(order.total) } },
      dedupeKey: `${order.publicId}:order_paid:staff`,
    });

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
