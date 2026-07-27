import type { CloverAppCredentials, CloverConnection, CloverTokenPair } from "./config";
import {
  isCloverAccessTokenExpired,
  refreshCloverTokens,
} from "./oauth";
import {
  normalizeCloverCategory,
  normalizeCloverItem,
  type CloverCategory,
  type CloverElements,
  type CloverItem,
  type CloverItemCreateInput,
  type CloverItemUpdateInput,
  type ListItemsParams,
} from "./inventory";
import {
  buildAtomicOrderBody,
  normalizeAtomicOrderResult,
  normalizeChargeResult,
  normalizeEcommerceOrder,
  normalizePakmsKey,
  normalizePayOrderResult,
  normalizePlatformOrder,
  normalizePlatformPayment,
  type CloverAtomicOrderInput,
  type CloverAtomicOrderResult,
  type CloverChargeInput,
  type CloverChargeResult,
  type CloverEcommerceOrderResult,
  type CloverPakmsKey,
  type CloverPayOrderInput,
  type CloverPayOrderResult,
  type CloverPlatformOrderResult,
  type CloverPlatformPaymentResult,
} from "./orders";
import { httpsOrigin, resolveCloverHosts } from "./urls";

export type CloverApiClientOptions = {
  credentials: CloverAppCredentials;
  /** Current connection (merchant + tokens). */
  connection: CloverConnection;
  /**
   * Called when tokens are rotated so the app can persist them.
   * Required for long-lived server usage; omit only for one-shot calls.
   */
  onTokensRefreshed?: (tokens: CloverTokenPair) => Promise<void> | void;
  fetchImpl?: typeof fetch;
};

/**
 * Thin authenticated Platform + Ecommerce API client.
 * Auth, merchant, inventory, atomic orders, PAKMS, pay-for-order / charges.
 */
export class CloverApiClient {
  private credentials: CloverAppCredentials;
  private connection: CloverConnection;
  private onTokensRefreshed?: CloverApiClientOptions["onTokensRefreshed"];
  private fetchImpl: typeof fetch;
  private refreshPromise: Promise<CloverTokenPair> | null = null;

  constructor(opts: CloverApiClientOptions) {
    this.credentials = opts.credentials;
    this.connection = opts.connection;
    this.onTokensRefreshed = opts.onTokensRefreshed;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  get merchantId(): string {
    const id = this.connection.merchantId;
    if (!id) throw new Error("Clover is not connected (missing merchantId)");
    return id;
  }

  private hosts() {
    return resolveCloverHosts(
      this.connection.environment ?? this.credentials.environment,
      this.connection.region ?? this.credentials.region,
    );
  }

  platformOrigin(): string {
    return httpsOrigin(this.hosts().apiHost);
  }

  ecommerceOrigin(): string {
    return httpsOrigin(this.hosts().ecommerceHost);
  }

  environment(): "sandbox" | "production" {
    return this.connection.environment ?? this.credentials.environment;
  }

  /** Ensure a valid access token, refreshing when near expiry. */
  async getAccessToken(): Promise<string> {
    const tokens = this.connection.tokens;
    if (!tokens) throw new Error("Clover is not connected (missing tokens)");
    if (!isCloverAccessTokenExpired(tokens)) return tokens.accessToken;

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const next = await refreshCloverTokens({
          credentials: this.credentials,
          refreshToken: tokens.refreshToken,
        });
        this.connection = { ...this.connection, tokens: next, connected: true };
        await this.onTokensRefreshed?.(next);
        return next;
      })().finally(() => {
        this.refreshPromise = null;
      });
    }
    const next = await this.refreshPromise;
    return next.accessToken;
  }

  async request<T = unknown>(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<T> {
    const token = await this.getAccessToken();
    const url = path.startsWith("http") ? path : `${this.platformOrigin()}${path}`;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${token}`);
    headers.set("Accept", "application/json");
    let body = init.body;
    if (init.json !== undefined) {
      headers.set("Content-Type", "application/json");
      body = JSON.stringify(init.json);
    }
    const { json: _json, ...rest } = init;
    const res = await this.fetchImpl(url, { ...rest, headers, body });
    const text = await res.text();
    let data: unknown = null;
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = text;
      }
    }
    if (!res.ok) {
      const msg =
        typeof data === "object" && data && "message" in data
          ? String((data as { message: unknown }).message)
          : typeof data === "string"
            ? data.slice(0, 200)
            : res.statusText;
      throw new Error(`Clover API ${res.status}: ${msg}`);
    }
    return data as T;
  }

  get<T = unknown>(path: string): Promise<T> {
    return this.request<T>(path, { method: "GET" });
  }

  post<T = unknown>(path: string, json?: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", json });
  }

  put<T = unknown>(path: string, json?: unknown): Promise<T> {
    return this.request<T>(path, { method: "PUT", json });
  }

  delete<T = unknown>(path: string): Promise<T> {
    return this.request<T>(path, { method: "DELETE" });
  }

  merchantPath(suffix: string): string {
    const s = suffix.startsWith("/") ? suffix : `/${suffix}`;
    return `/v3/merchants/${encodeURIComponent(this.merchantId)}${s}`;
  }

  /** Merchant display fields for Settings cards — never returns tokens. */
  async getMerchant(): Promise<CloverMerchantSummary> {
    const data = await this.get<{ id?: string; name?: string }>(this.merchantPath(""));
    return {
      id: typeof data.id === "string" && data.id ? data.id : this.merchantId,
      name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : this.merchantId,
    };
  }

  // ── Inventory: items ──────────────────────────────────────────────────────

  async listItems(params: ListItemsParams = {}): Promise<CloverElements<CloverItem>> {
    const q = new URLSearchParams();
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    if (params.expand) q.set("expand", params.expand);
    if (params.filter) q.set("filter", params.filter);
    const qs = q.toString();
    const path = this.merchantPath(`items${qs ? `?${qs}` : ""}`);
    const data = await this.get<{ elements?: unknown[] }>(path);
    const elements = Array.isArray(data.elements)
      ? data.elements.map((el) => normalizeCloverItem(el))
      : [];
    return { elements };
  }

  /** Paginate through all items (limit 100 per page). */
  async listAllItems(params: Omit<ListItemsParams, "limit" | "offset"> = {}): Promise<CloverItem[]> {
    const limit = 100;
    let offset = 0;
    const all: CloverItem[] = [];
    for (;;) {
      const page = await this.listItems({ ...params, limit, offset });
      all.push(...page.elements);
      if (page.elements.length < limit) break;
      offset += limit;
    }
    return all;
  }

  async getItem(itemId: string, expand?: string): Promise<CloverItem> {
    const q = expand ? `?expand=${encodeURIComponent(expand)}` : "";
    const data = await this.get(this.merchantPath(`items/${encodeURIComponent(itemId)}${q}`));
    return normalizeCloverItem(data);
  }

  async createItem(input: CloverItemCreateInput): Promise<CloverItem> {
    const data = await this.post(this.merchantPath("items"), cloverItemBody(input));
    return normalizeCloverItem(data);
  }

  /**
   * Update an existing item via POST …/items/{itemId}.
   * Stock quantity cannot be updated here — use updateItemStock.
   */
  async updateItem(itemId: string, input: CloverItemUpdateInput): Promise<CloverItem> {
    const body = cloverItemBody(input, { requireNamePrice: false });
    const data = await this.post(
      this.merchantPath(`items/${encodeURIComponent(itemId)}`),
      body,
    );
    return normalizeCloverItem(data);
  }

  /**
   * Permanently deletes a Clover item. Not used by default sync — local archive
   * maps to hidden/unavailable on push instead.
   */
  async deleteItem(itemId: string): Promise<void> {
    await this.delete(this.merchantPath(`items/${encodeURIComponent(itemId)}`));
  }

  /** Update stock quantity (separate endpoint from item update). */
  async updateItemStock(itemId: string, quantity: number): Promise<unknown> {
    return this.put(this.merchantPath(`item_stocks/${encodeURIComponent(itemId)}`), {
      quantity,
    });
  }

  // ── Inventory: categories ─────────────────────────────────────────────────

  async listCategories(params: { limit?: number; offset?: number } = {}): Promise<
    CloverElements<CloverCategory>
  > {
    const q = new URLSearchParams();
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    const qs = q.toString();
    const data = await this.get<{ elements?: unknown[] }>(
      this.merchantPath(`categories${qs ? `?${qs}` : ""}`),
    );
    const elements = Array.isArray(data.elements)
      ? data.elements.map((el) => normalizeCloverCategory(el))
      : [];
    return { elements };
  }

  async listAllCategories(): Promise<CloverCategory[]> {
    const limit = 100;
    let offset = 0;
    const all: CloverCategory[] = [];
    for (;;) {
      const page = await this.listCategories({ limit, offset });
      all.push(...page.elements);
      if (page.elements.length < limit) break;
      offset += limit;
    }
    return all;
  }

  async createCategory(name: string): Promise<CloverCategory> {
    const data = await this.post(this.merchantPath("categories"), { name });
    return normalizeCloverCategory(data);
  }

  /** Associate item ↔ category (many-to-many). */
  async associateCategoryItem(categoryId: string, itemId: string): Promise<void> {
    await this.post(this.merchantPath("category_items"), {
      elements: [{ category: { id: categoryId }, item: { id: itemId } }],
    });
  }

  /** Remove item ↔ category association. */
  async dissociateCategoryItem(categoryId: string, itemId: string): Promise<void> {
    await this.post(this.merchantPath("category_items?delete=true"), {
      elements: [{ category: { id: categoryId }, item: { id: itemId } }],
    });
  }

  // ── Orders (Platform atomic) ──────────────────────────────────────────────

  /**
   * Create a POS-visible order with inventory line items in one call.
   * POST /v3/merchants/{mId}/atomic_order/orders
   */
  async createAtomicOrder(input: CloverAtomicOrderInput): Promise<CloverAtomicOrderResult> {
    const data = await this.post(
      this.merchantPath("atomic_order/orders"),
      buildAtomicOrderBody(input),
    );
    return normalizeAtomicOrderResult(data);
  }

  // ── Ecommerce (SCL host) ──────────────────────────────────────────────────

  /** GET /pakms/apikey — public iframe tokenization key (not a secret). */
  async getPakmsApiKey(): Promise<CloverPakmsKey> {
    const data = await this.request(`${this.ecommerceOrigin()}/pakms/apikey`, {
      method: "GET",
    });
    return normalizePakmsKey(data);
  }

  /**
   * Pay a Platform/Ecommerce order with a tokenized card source.
   * POST /v1/orders/{orderId}/pay
   */
  async payOrder(input: CloverPayOrderInput): Promise<CloverPayOrderResult> {
    const headers: Record<string, string> = {};
    if (input.clientIp) headers["x-forwarded-for"] = input.clientIp;
    const body: Record<string, unknown> = {
      ecomind: "ecom",
      source: input.source,
    };
    if (input.email) body.email = input.email;
    if (input.currency) body.currency = input.currency;
    const data = await this.request(
      `${this.ecommerceOrigin()}/v1/orders/${encodeURIComponent(input.orderId)}/pay`,
      { method: "POST", json: body, headers },
    );
    return normalizePayOrderResult(data);
  }

  /**
   * Create a standalone Ecommerce charge (fallback when not paying an order id).
   * POST /v1/charges
   */
  async createCharge(input: CloverChargeInput): Promise<CloverChargeResult> {
    const headers: Record<string, string> = {};
    if (input.clientIp) headers["x-forwarded-for"] = input.clientIp;
    const body: Record<string, unknown> = {
      amount: input.amountCents,
      currency: (input.currency ?? "usd").toLowerCase(),
      source: input.source,
      ecomind: "ecom",
    };
    if (input.email) body.email = input.email;
    if (input.orderId) body.order = input.orderId;
    const data = await this.request(`${this.ecommerceOrigin()}/v1/charges`, {
      method: "POST",
      json: body,
      headers,
    });
    return normalizeChargeResult(data);
  }

  /**
   * Fetch an Ecommerce charge by id (Check status / settle sync).
   * GET /v1/charges/{chargeId}
   */
  async getCharge(chargeId: string): Promise<CloverChargeResult> {
    const data = await this.request(
      `${this.ecommerceOrigin()}/v1/charges/${encodeURIComponent(chargeId)}`,
      { method: "GET" },
    );
    return normalizeChargeResult(data);
  }

  /**
   * Fetch an Ecommerce order (may include charge / paid).
   * GET /v1/orders/{orderId}
   */
  async getEcommerceOrder(orderId: string): Promise<CloverEcommerceOrderResult> {
    const data = await this.request(
      `${this.ecommerceOrigin()}/v1/orders/${encodeURIComponent(orderId)}`,
      { method: "GET" },
    );
    return normalizeEcommerceOrder(data);
  }

  /**
   * Platform payment (app webhook `P:{id}`).
   * GET /v3/merchants/{mId}/payments/{paymentId}
   */
  async getPlatformPayment(paymentId: string): Promise<CloverPlatformPaymentResult> {
    const data = await this.get(this.merchantPath(`payments/${encodeURIComponent(paymentId)}`));
    return normalizePlatformPayment(data);
  }

  /**
   * Platform order; pass expand=payments for nested payment ids.
   * GET /v3/merchants/{mId}/orders/{orderId}
   */
  async getPlatformOrder(
    orderId: string,
    opts: { expand?: string } = {},
  ): Promise<CloverPlatformOrderResult> {
    const q = opts.expand ? `?expand=${encodeURIComponent(opts.expand)}` : "";
    const data = await this.get(
      this.merchantPath(`orders/${encodeURIComponent(orderId)}${q}`),
    );
    return normalizePlatformOrder(data);
  }
}

export type CloverMerchantSummary = {
  id: string;
  name: string;
};

/** Build Platform API item create/update JSON (omits undefined keys). */
function cloverItemBody(
  input: CloverItemCreateInput | CloverItemUpdateInput,
  opts: { requireNamePrice?: boolean } = {},
): Record<string, unknown> {
  const requireNamePrice = opts.requireNamePrice !== false;
  const body: Record<string, unknown> = {};
  if (requireNamePrice) {
    body.name = (input as CloverItemCreateInput).name;
    body.price = (input as CloverItemCreateInput).price;
  } else {
    if (input.name != null) body.name = input.name;
    if (input.price != null) body.price = input.price;
  }
  if (input.priceType != null) body.priceType = input.priceType;
  if (input.hidden != null) body.hidden = input.hidden;
  if (input.available != null) body.available = input.available;
  if (input.autoManage != null) body.autoManage = input.autoManage;
  if (input.code !== undefined) body.code = input.code;
  if (input.sku !== undefined) body.sku = input.sku;
  if (input.alternateName !== undefined) body.alternateName = input.alternateName;
  if (input.cost !== undefined) body.cost = input.cost;
  if (input.unitName !== undefined) body.unitName = input.unitName;
  if (input.colorCode !== undefined) body.colorCode = input.colorCode;
  return body;
}

/**
 * App webhook setup (Developer Dashboard → App Settings → Webhooks).
 * Auth via `X-Clover-Auth` + `CLOVER_WEBHOOK_AUTH`. Subscribe to Payments + Orders.
 * Hosted Checkout HMAC webhooks are a separate product path (not used here).
 */
export const CLOVER_WEBHOOK_NOTES = {
  configureIn: "Clover Developer Dashboard → app → Webhooks",
  verify: "Compare X-Clover-Auth to CLOVER_WEBHOOK_AUTH (constant-time)",
  events: "P (payments CREATE/UPDATE), O (orders CREATE/UPDATE) — then fetch object",
  idempotency: "Retries expected; settle paid / ledger only once",
  localDev: "HTTPS public URL required — use ngrok/cloudflare tunnel to localhost",
} as const;
