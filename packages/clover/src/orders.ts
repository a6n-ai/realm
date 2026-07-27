/**
 * Clover Platform Orders (atomic) + Ecommerce pay helpers.
 *
 * Recommended website flow (inventory-backed, POS-visible):
 * 1. POST /v3/merchants/{mId}/atomic_order/orders  — create order with item refs
 * 2. Tokenize card via iframe (PAKMS key + checkout SDK)
 * 3. POST /v1/orders/{orderId}/pay on Ecommerce (SCL) host
 *
 * Amounts on Platform are integer cents. Ecommerce pay uses the order total.
 */

export type CloverAtomicLineItemInput = {
  /** Clover inventory item id. */
  itemId: string;
  /** Optional display override; Clover usually takes inventory name/price. */
  name?: string;
  /** Optional unit price override in cents. */
  price?: number;
};

export type CloverAtomicOrderInput = {
  lineItems: CloverAtomicLineItemInput[];
  /** Merchant order type id (pickup/online). Optional for first slice. */
  orderTypeId?: string;
  note?: string;
};

export type CloverAtomicOrderResult = {
  id: string;
  total?: number;
  currency?: string;
  raw: unknown;
};

export type CloverPayOrderInput = {
  orderId: string;
  /** Tokenized card source (`clv_…`). */
  source: string;
  email?: string;
  /** Client IP for fraud / x-forwarded-for. */
  clientIp?: string;
  currency?: string;
};

export type CloverPayOrderResult = {
  id: string;
  status?: string;
  chargeId?: string;
  amount?: number;
  currency?: string;
  raw: unknown;
};

export type CloverPakmsKey = {
  apiAccessKey: string;
  active?: boolean;
  merchantUuid?: string;
  developerAppUuid?: string;
};

export type CloverChargeInput = {
  amountCents: number;
  currency?: string;
  source: string;
  email?: string;
  clientIp?: string;
  /** Optional Platform/Ecommerce order id to associate. */
  orderId?: string;
};

export type CloverChargeResult = {
  id: string;
  status?: string;
  /** Ecommerce charge `paid` flag when present. */
  paid?: boolean;
  amount?: number;
  currency?: string;
  /** Associated Platform/Ecommerce order id when returned. */
  orderId?: string;
  raw: unknown;
};

/** Expand qty into repeated atomic line refs (Platform atomic uses one row per unit). */
export function expandAtomicLineItems(
  lines: { itemId: string; quantity: number; name?: string; priceCents?: number }[],
): CloverAtomicLineItemInput[] {
  const out: CloverAtomicLineItemInput[] = [];
  for (const line of lines) {
    const qty = Math.max(0, Math.floor(line.quantity));
    for (let i = 0; i < qty; i++) {
      out.push({
        itemId: line.itemId,
        name: line.name,
        price: line.priceCents,
      });
    }
  }
  return out;
}

export function buildAtomicOrderBody(input: CloverAtomicOrderInput): Record<string, unknown> {
  if (!input.lineItems.length) throw new Error("atomic order requires at least one line item");
  const lineItems = input.lineItems.map((li) => {
    const row: Record<string, unknown> = {
      item: { id: li.itemId },
      printed: false,
    };
    if (li.name != null) row.name = li.name;
    if (li.price != null) row.price = li.price;
    return row;
  });
  const orderCart: Record<string, unknown> = {
    lineItems,
    groupLineItems: false,
  };
  if (input.orderTypeId) orderCart.orderType = { id: input.orderTypeId };
  if (input.note) orderCart.note = input.note;
  return { orderCart };
}

export function normalizeAtomicOrderResult(raw: unknown): CloverAtomicOrderResult {
  if (!raw || typeof raw !== "object") throw new Error("Invalid atomic order response");
  const o = raw as Record<string, unknown>;
  // Response may nest under `id` or `orderRef.id` / `href`.
  let id = typeof o.id === "string" ? o.id : "";
  if (!id && o.orderRef && typeof o.orderRef === "object") {
    const ref = o.orderRef as Record<string, unknown>;
    id = typeof ref.id === "string" ? ref.id : "";
  }
  if (!id) throw new Error("Clover atomic order missing id");
  const total = typeof o.total === "number" ? o.total : undefined;
  const currency = typeof o.currency === "string" ? o.currency : undefined;
  return { id, total, currency, raw };
}

export function normalizePayOrderResult(raw: unknown): CloverPayOrderResult {
  if (!raw || typeof raw !== "object") throw new Error("Invalid pay-order response");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) throw new Error("Clover pay-order missing id");
  const charge =
    typeof o.charge === "string"
      ? o.charge
      : o.charge && typeof o.charge === "object" && typeof (o.charge as { id?: unknown }).id === "string"
        ? String((o.charge as { id: string }).id)
        : undefined;
  return {
    id,
    status: typeof o.status === "string" ? o.status : undefined,
    chargeId: charge,
    amount: typeof o.amount === "number" ? o.amount : undefined,
    currency: typeof o.currency === "string" ? o.currency : undefined,
    raw,
  };
}

export function normalizePakmsKey(raw: unknown): CloverPakmsKey {
  if (!raw || typeof raw !== "object") throw new Error("Invalid PAKMS response");
  const o = raw as Record<string, unknown>;
  const apiAccessKey = typeof o.apiAccessKey === "string" ? o.apiAccessKey : "";
  if (!apiAccessKey) throw new Error("PAKMS response missing apiAccessKey");
  return {
    apiAccessKey,
    active: typeof o.active === "boolean" ? o.active : undefined,
    merchantUuid: typeof o.merchantUuid === "string" ? o.merchantUuid : undefined,
    developerAppUuid: typeof o.developerAppUuid === "string" ? o.developerAppUuid : undefined,
  };
}

export function normalizeChargeResult(raw: unknown): CloverChargeResult {
  if (!raw || typeof raw !== "object") throw new Error("Invalid charge response");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) throw new Error("Clover charge missing id");
  const order =
    typeof o.order === "string"
      ? o.order
      : o.order && typeof o.order === "object" && typeof (o.order as { id?: unknown }).id === "string"
        ? String((o.order as { id: string }).id)
        : undefined;
  return {
    id,
    status: typeof o.status === "string" ? o.status : undefined,
    paid: typeof o.paid === "boolean" ? o.paid : undefined,
    amount: typeof o.amount === "number" ? o.amount : undefined,
    currency: typeof o.currency === "string" ? o.currency : undefined,
    orderId: order,
    raw,
  };
}

export type CloverPlatformPaymentResult = {
  id: string;
  /** Platform payment result: SUCCESS, FAIL, VOIDED, … */
  result?: string;
  amount?: number;
  orderId?: string;
  raw: unknown;
};

export type CloverEcommerceOrderResult = {
  id: string;
  status?: string;
  amount?: number;
  currency?: string;
  chargeId?: string;
  paid?: boolean;
  raw: unknown;
};

export type CloverPlatformOrderResult = {
  id: string;
  paymentState?: string;
  /** Nested Platform payment ids (when expand=payments). */
  paymentIds: string[];
  raw: unknown;
};

export function normalizePlatformPayment(raw: unknown): CloverPlatformPaymentResult {
  if (!raw || typeof raw !== "object") throw new Error("Invalid platform payment response");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) throw new Error("Clover payment missing id");
  const orderId =
    typeof o.order === "string"
      ? o.order
      : o.order && typeof o.order === "object" && typeof (o.order as { id?: unknown }).id === "string"
        ? String((o.order as { id: string }).id)
        : undefined;
  return {
    id,
    result: typeof o.result === "string" ? o.result : undefined,
    amount: typeof o.amount === "number" ? o.amount : undefined,
    orderId,
    raw,
  };
}

export function normalizeEcommerceOrder(raw: unknown): CloverEcommerceOrderResult {
  if (!raw || typeof raw !== "object") throw new Error("Invalid ecommerce order response");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) throw new Error("Clover ecommerce order missing id");
  const charge =
    typeof o.charge === "string"
      ? o.charge
      : o.charge && typeof o.charge === "object" && typeof (o.charge as { id?: unknown }).id === "string"
        ? String((o.charge as { id: string }).id)
        : undefined;
  return {
    id,
    status: typeof o.status === "string" ? o.status : undefined,
    amount: typeof o.amount === "number" ? o.amount : undefined,
    currency: typeof o.currency === "string" ? o.currency : undefined,
    chargeId: charge,
    paid: typeof o.paid === "boolean" ? o.paid : undefined,
    raw,
  };
}

export function normalizePlatformOrder(raw: unknown): CloverPlatformOrderResult {
  if (!raw || typeof raw !== "object") throw new Error("Invalid platform order response");
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === "string" ? o.id : "";
  if (!id) throw new Error("Clover platform order missing id");
  const paymentIds: string[] = [];
  const payments = o.payments;
  if (payments && typeof payments === "object") {
    const elements = Array.isArray(payments)
      ? payments
      : Array.isArray((payments as { elements?: unknown[] }).elements)
        ? (payments as { elements: unknown[] }).elements
        : [];
    for (const el of elements) {
      if (el && typeof el === "object" && typeof (el as { id?: unknown }).id === "string") {
        paymentIds.push(String((el as { id: string }).id));
      }
    }
  }
  return {
    id,
    paymentState: typeof o.paymentState === "string" ? o.paymentState : undefined,
    paymentIds,
    raw,
  };
}

/**
 * Map remote Clover payment/charge/order signals → local payment_status subset.
 * Prefer explicit paid/succeeded/SUCCESS over vague "pending".
 */
export type MappedCloverPaymentStatus = "paid" | "failed" | "awaiting_payment";

export function mapCloverRemoteToPaymentStatus(input: {
  chargeStatus?: string | null;
  chargePaid?: boolean | null;
  paymentResult?: string | null;
  orderStatus?: string | null;
  orderPaid?: boolean | null;
  paymentState?: string | null;
}): MappedCloverPaymentStatus {
  const charge = (input.chargeStatus ?? "").toLowerCase();
  const order = (input.orderStatus ?? "").toLowerCase();
  const result = (input.paymentResult ?? "").toUpperCase();
  const paymentState = (input.paymentState ?? "").toUpperCase();

  if (
    input.chargePaid === true ||
    input.orderPaid === true ||
    charge === "succeeded" ||
    charge === "paid" ||
    order === "paid" ||
    result === "SUCCESS" ||
    paymentState === "PAID"
  ) {
    return "paid";
  }

  if (
    charge === "failed" ||
    charge === "canceled" ||
    charge === "cancelled" ||
    order === "failed" ||
    result === "FAIL" ||
    result === "FAILED" ||
    result === "VOIDED" ||
    result === "CANCEL" ||
    result === "CANCELED" ||
    paymentState === "FAILED"
  ) {
    return "failed";
  }

  return "awaiting_payment";
}

/** Iframe SDK script URL for the given environment. */
export function cloverCheckoutSdkUrl(environment: "sandbox" | "production"): string {
  return environment === "sandbox"
    ? "https://checkout.sandbox.dev.clover.com/sdk.js"
    : "https://checkout.clover.com/sdk.js";
}
