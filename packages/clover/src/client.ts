import type {
  CloverAppCredentials,
  CloverConnection,
  CloverTokenPair,
} from "./config";
import { resolveWebOrderTypeId } from "./config";
import {
  isCloverAccessTokenExpired,
  refreshCloverTokens,
} from "./oauth";
import {
  normalizeCloverEmployee,
  type CloverEmployee,
  type CloverEmployeeCreateInput,
  type CloverEmployeeUpdateInput,
  type ListEmployeesParams,
} from "./employees";
import {
  normalizeCloverCategory,
  normalizeCloverDiscount,
  normalizeCloverTaxRate,
  normalizeCloverTag,
  normalizeCloverMenu,
  normalizeCloverMenuItem,
  normalizeCloverItem,
  normalizeCloverModifier,
  normalizeCloverModifierGroup,
  type CloverCategory,
  type CloverCategoryCreateInput,
  type CloverCategoryUpdateInput,
  type CloverDiscount,
  type CloverTaxRate,
  type CloverTag,
  type CloverMenu,
  type CloverMenuItem,
  type CloverDiscountCreateInput,
  type CloverDiscountUpdateInput,
  type CloverElements,
  type CloverItem,
  type CloverItemCreateInput,
  type CloverItemUpdateInput,
  type CloverModifier,
  type CloverModifierCreateInput,
  type CloverModifierGroup,
  type CloverModifierGroupCreateInput,
  type CloverModifierGroupUpdateInput,
  type CloverModifierUpdateInput,
  type ListInventoryParams,
  type ListItemsParams,
} from "./inventory";
import {
  buildAtomicOrderBody,
  normalizeOrderTypes,
  normalizeAtomicCheckoutResult,
  normalizeAtomicOrderResult,
  normalizeChargeResult,
  normalizeEcommerceOrder,
  normalizePakmsKey,
  normalizePayOrderResult,
  normalizePlatformOrder,
  normalizePlatformPayment,
  type CloverAtomicCheckoutResult,
  type CloverAtomicOrderInput,
  type CloverAtomicOrderResult,
  type CloverChargeInput,
  type CloverChargeResult,
  type CloverEcommerceOrderResult,
  type CloverOrderType,
  type CloverPakmsKey,
  type CloverPayOrderInput,
  type CloverPayOrderResult,
  type CloverPlatformOrderResult,
  type CloverPlatformPaymentResult,
} from "./orders";
import { httpsOrigin, resolveCloverHosts } from "./urls";

export type CloverApiClientOptions = {
  /** Required for OAuth mode (token refresh). Omit in API-token mode. */
  credentials?: CloverAppCredentials;
  /** Current connection (merchant + tokens, or merchant API tokens). */
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
 *
 * Two auth modes, both carried on the connection. OAuth: one access token
 * covers both API surfaces, refreshed on expiry. API token: two separate
 * non-expiring bearer tokens, because Platform (v3) and Ecommerce (v1) are
 * genuinely different Clover credentials — the single OAuth token happening
 * to work for both is what hides that.
 */
export class CloverApiClient {
  private credentials?: CloverAppCredentials;
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
      this.connection.environment ?? this.credentials?.environment ?? "sandbox",
      this.connection.region ?? this.credentials?.region ?? "na",
    );
  }

  platformOrigin(): string {
    return httpsOrigin(this.hosts().apiHost);
  }

  ecommerceOrigin(): string {
    return httpsOrigin(this.hosts().ecommerceHost);
  }

  environment(): "sandbox" | "production" {
    return this.connection.environment ?? this.credentials?.environment ?? "sandbox";
  }

  /**
   * Platform (v3) bearer token, refreshing when near expiry.
   * Merchant API tokens are permanent, so that mode short-circuits.
   */
  async getAccessToken(): Promise<string> {
    if (this.connection.authMode === "apiToken") {
      const apiToken = this.connection.apiToken;
      if (!apiToken) throw new Error("Clover is not connected (missing API token)");
      return apiToken;
    }

    const tokens = this.connection.tokens;
    if (!tokens) throw new Error("Clover is not connected (missing tokens)");
    if (!isCloverAccessTokenExpired(tokens)) return tokens.accessToken;

    const credentials = this.credentials;
    if (!credentials) {
      throw new Error("Clover access token expired and no app credentials to refresh with");
    }

    if (!this.refreshPromise) {
      this.refreshPromise = (async () => {
        const next = await refreshCloverTokens({
          credentials,
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

  /**
   * Bearer token for a request, routed by URL. OAuth mode: the single shared
   * access token, for either surface. API-token mode: the Ecommerce private
   * token for Ecommerce-origin URLs, the Platform merchant token otherwise —
   * these are two distinct Clover credentials, not interchangeable.
   */
  private async bearerFor(url: string): Promise<string> {
    if (this.connection.authMode !== "apiToken") return this.getAccessToken();
    if (!url.startsWith(this.ecommerceOrigin())) return this.getAccessToken();
    const ecommerceToken = this.connection.ecommercePrivateToken;
    if (!ecommerceToken) {
      throw new Error(
        "Clover Ecommerce API token is not configured (required for checkout in API-token mode)",
      );
    }
    return ecommerceToken;
  }

  async request<T = unknown>(
    path: string,
    init: RequestInit & { json?: unknown } = {},
  ): Promise<T> {
    const url = path.startsWith("http") ? path : `${this.platformOrigin()}${path}`;
    const token = await this.bearerFor(url);
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

  private inventoryQuery(params: ListInventoryParams | ListItemsParams): string {
    const q = new URLSearchParams();
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    if (params.expand) q.set("expand", params.expand);
    if (params.filter) q.set("filter", params.filter);
    const qs = q.toString();
    return qs ? `?${qs}` : "";
  }

  private async paginateInventory<T>(
    fetchPage: (p: { limit: number; offset: number }) => Promise<CloverElements<T>>,
  ): Promise<T[]> {
    const limit = 100;
    let offset = 0;
    const all: T[] = [];
    for (;;) {
      const page = await fetchPage({ limit, offset });
      all.push(...page.elements);
      if (page.elements.length < limit) break;
      offset += limit;
    }
    return all;
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
    const data = await this.get<{ elements?: unknown[] }>(
      this.merchantPath(`items${this.inventoryQuery(params)}`),
    );
    const elements = Array.isArray(data.elements)
      ? data.elements.map((el) => normalizeCloverItem(el))
      : [];
    return { elements };
  }

  /** Paginate through all items (limit 100 per page). */
  async listAllItems(params: Omit<ListItemsParams, "limit" | "offset"> = {}): Promise<CloverItem[]> {
    return this.paginateInventory((p) => this.listItems({ ...params, ...p }));
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

  async listCategories(params: ListInventoryParams = {}): Promise<CloverElements<CloverCategory>> {
    const data = await this.get<{ elements?: unknown[] }>(
      this.merchantPath(`categories${this.inventoryQuery(params)}`),
    );
    const elements = Array.isArray(data.elements)
      ? data.elements.map((el) => normalizeCloverCategory(el))
      : [];
    return { elements };
  }

  async listAllCategories(
    params: Omit<ListInventoryParams, "limit" | "offset"> = {},
  ): Promise<CloverCategory[]> {
    return this.paginateInventory((p) => this.listCategories({ ...params, ...p }));
  }

  async getCategory(categoryId: string, expand?: string): Promise<CloverCategory> {
    const q = expand ? `?expand=${encodeURIComponent(expand)}` : "";
    const data = await this.get(
      this.merchantPath(`categories/${encodeURIComponent(categoryId)}${q}`),
    );
    return normalizeCloverCategory(data);
  }

  async createCategory(input: CloverCategoryCreateInput | string): Promise<CloverCategory> {
    const body = typeof input === "string" ? { name: input } : cloverCategoryBody(input);
    const data = await this.post(this.merchantPath("categories"), body);
    return normalizeCloverCategory(data);
  }

  /** Update via POST …/categories/{categoryId}. */
  async updateCategory(
    categoryId: string,
    input: CloverCategoryUpdateInput,
  ): Promise<CloverCategory> {
    const data = await this.post(
      this.merchantPath(`categories/${encodeURIComponent(categoryId)}`),
      cloverCategoryBody(input, { requireName: false }),
    );
    return normalizeCloverCategory(data);
  }

  async deleteCategory(categoryId: string): Promise<void> {
    await this.delete(this.merchantPath(`categories/${encodeURIComponent(categoryId)}`));
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

  // ── Inventory: modifier groups + modifiers ────────────────────────────────

  async listModifierGroups(
    params: ListInventoryParams = {},
  ): Promise<CloverElements<CloverModifierGroup>> {
    const data = await this.get<{ elements?: unknown[] }>(
      this.merchantPath(`modifier_groups${this.inventoryQuery(params)}`),
    );
    const elements = Array.isArray(data.elements)
      ? data.elements.map((el) => normalizeCloverModifierGroup(el))
      : [];
    return { elements };
  }

  async listAllModifierGroups(
    params: Omit<ListInventoryParams, "limit" | "offset"> = {},
  ): Promise<CloverModifierGroup[]> {
    return this.paginateInventory((p) => this.listModifierGroups({ ...params, ...p }));
  }

  async getModifierGroup(modGroupId: string, expand?: string): Promise<CloverModifierGroup> {
    const q = expand ? `?expand=${encodeURIComponent(expand)}` : "";
    const data = await this.get(
      this.merchantPath(`modifier_groups/${encodeURIComponent(modGroupId)}${q}`),
    );
    return normalizeCloverModifierGroup(data);
  }

  async createModifierGroup(input: CloverModifierGroupCreateInput): Promise<CloverModifierGroup> {
    const data = await this.post(this.merchantPath("modifier_groups"), cloverModifierGroupBody(input));
    return normalizeCloverModifierGroup(data);
  }

  async updateModifierGroup(
    modGroupId: string,
    input: CloverModifierGroupUpdateInput,
  ): Promise<CloverModifierGroup> {
    const data = await this.post(
      this.merchantPath(`modifier_groups/${encodeURIComponent(modGroupId)}`),
      cloverModifierGroupBody(input, { requireName: false }),
    );
    return normalizeCloverModifierGroup(data);
  }

  async createModifier(input: CloverModifierCreateInput): Promise<CloverModifier> {
    const data = await this.post(this.merchantPath("modifiers"), cloverModifierBody(input));
    return normalizeCloverModifier(data);
  }

  async updateModifier(modifierId: string, input: CloverModifierUpdateInput): Promise<CloverModifier> {
    const data = await this.post(
      this.merchantPath(`modifiers/${encodeURIComponent(modifierId)}`),
      cloverModifierBody(input, { requireNameGroup: false }),
    );
    return normalizeCloverModifier(data);
  }

  /** Associate item ↔ modifier group. */
  async associateItemModifierGroup(modifierGroupId: string, itemId: string): Promise<void> {
    await this.post(this.merchantPath("item_modifier_groups"), {
      elements: [{ modifierGroup: { id: modifierGroupId }, item: { id: itemId } }],
    });
  }

  /** Remove item ↔ modifier group association. */
  async dissociateItemModifierGroup(modifierGroupId: string, itemId: string): Promise<void> {
    await this.post(this.merchantPath("item_modifier_groups?delete=true"), {
      elements: [{ modifierGroup: { id: modifierGroupId }, item: { id: itemId } }],
    });
  }

  // ── Inventory: tax rates ──────────────────────────────────────────────────

  async listTaxRates(params: ListInventoryParams = {}): Promise<CloverElements<CloverTaxRate>> {
    const data = await this.get<{ elements?: unknown[] }>(
      this.merchantPath(`tax_rates${this.inventoryQuery(params)}`),
    );
    const elements = Array.isArray(data.elements)
      ? data.elements.map((el) => normalizeCloverTaxRate(el))
      : [];
    return { elements };
  }

  async listAllTaxRates(
    params: Omit<ListInventoryParams, "limit" | "offset"> = {},
  ): Promise<CloverTaxRate[]> {
    return this.paginateInventory((p) => this.listTaxRates({ ...params, ...p }));
  }

  /** Associate item ↔ tax rate. */
  async associateTaxRateItem(taxRateId: string, itemId: string): Promise<void> {
    await this.post(this.merchantPath("tax_rate_items"), {
      elements: [{ taxRate: { id: taxRateId }, item: { id: itemId } }],
    });
  }

  /** Remove item ↔ tax rate association. */
  async dissociateTaxRateItem(taxRateId: string, itemId: string): Promise<void> {
    await this.post(this.merchantPath("tax_rate_items?delete=true"), {
      elements: [{ taxRate: { id: taxRateId }, item: { id: itemId } }],
    });
  }

  // ── Inventory: tags (Order printing labels) ───────────────────────────────

  async listTags(params: ListInventoryParams = {}): Promise<CloverElements<CloverTag>> {
    const data = await this.get<{ elements?: unknown[] }>(
      this.merchantPath(`tags${this.inventoryQuery(params)}`),
    );
    const elements = Array.isArray(data.elements)
      ? data.elements.map((el) => normalizeCloverTag(el))
      : [];
    return { elements };
  }

  async listAllTags(
    params: Omit<ListInventoryParams, "limit" | "offset"> = {},
  ): Promise<CloverTag[]> {
    return this.paginateInventory((p) => this.listTags({ ...params, ...p }));
  }

  async createTag(input: { name: string; showInReporting?: boolean }): Promise<CloverTag> {
    const body: Record<string, unknown> = { name: input.name };
    if (input.showInReporting != null) body.showInReporting = input.showInReporting;
    return normalizeCloverTag(await this.post(this.merchantPath("tags"), body));
  }

  /** Associate item ↔ tag. */
  async associateTagItem(tagId: string, itemId: string): Promise<void> {
    await this.post(this.merchantPath("tag_items"), {
      elements: [{ tag: { id: tagId }, item: { id: itemId } }],
    });
  }

  /** Remove item ↔ tag association. */
  async dissociateTagItem(tagId: string, itemId: string): Promise<void> {
    await this.post(this.merchantPath("tag_items?delete=true"), {
      elements: [{ tag: { id: tagId }, item: { id: itemId } }],
    });
  }

  // ── Online-ordering menus ─────────────────────────────────────────────────

  /** Unlike every other inventory endpoint this one answers `{menus: [...]}`. */
  async listMenus(): Promise<CloverMenu[]> {
    const data = await this.get<{ menus?: unknown[] }>(this.merchantPath("menus"));
    return Array.isArray(data.menus) ? data.menus.map((el) => normalizeCloverMenu(el)) : [];
  }

  /** A menu's item list, each with that menu's own price. Answers `{items: [...]}`. */
  async listMenuItems(menuId: string): Promise<CloverMenuItem[]> {
    const data = await this.get<{ items?: unknown[] }>(
      this.merchantPath(`menus/${encodeURIComponent(menuId)}/items`),
    );
    return Array.isArray(data.items) ? data.items.map((el) => normalizeCloverMenuItem(el)) : [];
  }

  // ── Inventory: discounts ──────────────────────────────────────────────────

  async listDiscounts(params: ListInventoryParams = {}): Promise<CloverElements<CloverDiscount>> {
    const data = await this.get<{ elements?: unknown[] }>(
      this.merchantPath(`discounts${this.inventoryQuery(params)}`),
    );
    const elements = Array.isArray(data.elements)
      ? data.elements.map((el) => normalizeCloverDiscount(el))
      : [];
    return { elements };
  }

  async listAllDiscounts(
    params: Omit<ListInventoryParams, "limit" | "offset"> = {},
  ): Promise<CloverDiscount[]> {
    return this.paginateInventory((p) => this.listDiscounts({ ...params, ...p }));
  }

  async getDiscount(discountId: string): Promise<CloverDiscount> {
    const data = await this.get(
      this.merchantPath(`discounts/${encodeURIComponent(discountId)}`),
    );
    return normalizeCloverDiscount(data);
  }

  async createDiscount(input: CloverDiscountCreateInput): Promise<CloverDiscount> {
    const data = await this.post(this.merchantPath("discounts"), cloverDiscountBody(input));
    return normalizeCloverDiscount(data);
  }

  async updateDiscount(
    discountId: string,
    input: CloverDiscountUpdateInput,
  ): Promise<CloverDiscount> {
    const data = await this.post(
      this.merchantPath(`discounts/${encodeURIComponent(discountId)}`),
      cloverDiscountBody(input, { requireName: false }),
    );
    return normalizeCloverDiscount(data);
  }

  async deleteDiscount(discountId: string): Promise<void> {
    await this.delete(this.merchantPath(`discounts/${encodeURIComponent(discountId)}`));
  }

  // ── Employees ─────────────────────────────────────────────────────────────

  async listEmployees(
    params: ListEmployeesParams = {},
  ): Promise<CloverElements<CloverEmployee>> {
    const data = await this.get<{ elements?: unknown[] }>(
      this.merchantPath(`employees${this.inventoryQuery(params)}`),
    );
    const elements = Array.isArray(data.elements)
      ? data.elements.map((el) => normalizeCloverEmployee(el))
      : [];
    return { elements };
  }

  async listAllEmployees(
    params: Omit<ListEmployeesParams, "limit" | "offset"> = {},
  ): Promise<CloverEmployee[]> {
    return this.paginateInventory((p) => this.listEmployees({ ...params, ...p }));
  }

  async getEmployee(employeeId: string, expand?: string): Promise<CloverEmployee> {
    const q = expand ? `?expand=${encodeURIComponent(expand)}` : "";
    const data = await this.get(
      this.merchantPath(`employees/${encodeURIComponent(employeeId)}${q}`),
    );
    return normalizeCloverEmployee(data);
  }

  async createEmployee(input: CloverEmployeeCreateInput): Promise<CloverEmployee> {
    const data = await this.post(this.merchantPath("employees"), cloverEmployeeBody(input));
    return normalizeCloverEmployee(data);
  }

  /** Update via POST …/employees/{empId}. */
  async updateEmployee(
    employeeId: string,
    input: CloverEmployeeUpdateInput,
  ): Promise<CloverEmployee> {
    const data = await this.post(
      this.merchantPath(`employees/${encodeURIComponent(employeeId)}`),
      cloverEmployeeBody(input, { requireName: false }),
    );
    return normalizeCloverEmployee(data);
  }

  async deleteEmployee(employeeId: string): Promise<void> {
    await this.delete(this.merchantPath(`employees/${encodeURIComponent(employeeId)}`));
  }

  // ── Orders (Platform atomic) ──────────────────────────────────────────────

  /**
   * Which Clover order type a website order should carry.
   *
   * Answered from the connection THIS client was built with, deliberately: a
   * second read of the integrations config resolves the acting org again, and a
   * request that resolved differently would stamp another merchant's order type
   * on the order. One read, one merchant, one answer.
   */
  webOrderTypeId(
    fulfillment: "pickup" | "delivery_instant" | "delivery_scheduled",
  ): string | undefined {
    return resolveWebOrderTypeId(this.connection, fulfillment);
  }

  /**
   * Merchant-defined order types, for the admin to pick which one website
   * orders should carry. GET /v3/merchants/{mId}/order_types
   *
   * Deleted types are filtered out — Clover keeps returning them, but stamping
   * one on an order is rejected.
   */
  async listOrderTypes(): Promise<CloverOrderType[]> {
    const data = await this.get(this.merchantPath("order_types"));
    return normalizeOrderTypes(data);
  }

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

  /**
   * Compute order totals and tax without creating anything on the POS.
   * POST /v3/merchants/{mId}/atomic_order/checkouts
   *
   * This is the authority for what a customer will actually be charged: the
   * Ecommerce `POST /v1/orders/{id}/pay` bills the Clover order's total, not ours.
   */
  async checkoutAtomicOrder(input: CloverAtomicOrderInput): Promise<CloverAtomicCheckoutResult> {
    const data = await this.post(
      this.merchantPath("atomic_order/checkouts"),
      buildAtomicOrderBody(input),
    );
    return normalizeAtomicCheckoutResult(data);
  }

  // ── Ecommerce (SCL host) ──────────────────────────────────────────────────

  /** GET /pakms/apikey — public iframe tokenization key (not a secret). */
  async getPakmsApiKey(): Promise<CloverPakmsKey> {
    // API-token mode already has this key — it's what was generated in the
    // merchant Dashboard, no fetch needed (and no OAuth access token to fetch it with).
    const publicKey = this.connection.ecommercePublicKey;
    if (this.connection.authMode === "apiToken" && publicKey) {
      return { apiAccessKey: publicKey };
    }
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

  /**
   * Assign (or clear) the employee who owns a Platform order.
   * POST /v3/merchants/{mId}/orders/{orderId}
   */
  async updatePlatformOrderEmployee(
    orderId: string,
    employeeId: string | null,
  ): Promise<CloverPlatformOrderResult> {
    const body =
      employeeId == null
        ? { employee: null }
        : { employee: { id: employeeId } };
    const data = await this.post(
      this.merchantPath(`orders/${encodeURIComponent(orderId)}`),
      body,
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
  if (input.onlineName !== undefined) body.onlineName = input.onlineName;
  if (input.description !== undefined) body.description = input.description;
  if (input.enabledOnline != null) body.enabledOnline = input.enabledOnline;
  if (input.isAgeRestricted != null) body.isAgeRestricted = input.isAgeRestricted;
  if (input.defaultTaxRates != null) body.defaultTaxRates = input.defaultTaxRates;
  if (input.isRevenue != null) body.isRevenue = input.isRevenue;
  return body;
}

function cloverCategoryBody(
  input: CloverCategoryCreateInput | CloverCategoryUpdateInput,
  opts: { requireName?: boolean } = {},
): Record<string, unknown> {
  const requireName = opts.requireName !== false;
  const body: Record<string, unknown> = {};
  if (requireName) {
    body.name = (input as CloverCategoryCreateInput).name;
  } else if (input.name != null) {
    body.name = input.name;
  }
  if (input.sortOrder != null) body.sortOrder = input.sortOrder;
  if (input.colorCode !== undefined) body.colorCode = input.colorCode;
  return body;
}

function cloverModifierGroupBody(
  input: CloverModifierGroupCreateInput | CloverModifierGroupUpdateInput,
  opts: { requireName?: boolean } = {},
): Record<string, unknown> {
  const requireName = opts.requireName !== false;
  const body: Record<string, unknown> = {};
  if (requireName) {
    body.name = (input as CloverModifierGroupCreateInput).name;
  } else if (input.name != null) {
    body.name = input.name;
  }
  if (input.alternateName !== undefined) body.alternateName = input.alternateName;
  if (input.minRequired !== undefined) body.minRequired = input.minRequired;
  if (input.maxAllowed !== undefined) body.maxAllowed = input.maxAllowed;
  if (input.showByDefault != null) body.showByDefault = input.showByDefault;
  if (input.sortOrder != null) body.sortOrder = input.sortOrder;
  return body;
}

function cloverModifierBody(
  input: CloverModifierCreateInput | CloverModifierUpdateInput,
  opts: { requireNameGroup?: boolean } = {},
): Record<string, unknown> {
  const requireNameGroup = opts.requireNameGroup !== false;
  const body: Record<string, unknown> = {};
  if (requireNameGroup) {
    body.name = (input as CloverModifierCreateInput).name;
    body.modifierGroup = (input as CloverModifierCreateInput).modifierGroup;
  } else {
    if (input.name != null) body.name = input.name;
    if (input.modifierGroup != null) body.modifierGroup = input.modifierGroup;
  }
  if (input.alternateName !== undefined) body.alternateName = input.alternateName;
  if (input.price != null) body.price = input.price;
  if (input.available != null) body.available = input.available;
  return body;
}

function cloverDiscountBody(
  input: CloverDiscountCreateInput | CloverDiscountUpdateInput,
  opts: { requireName?: boolean } = {},
): Record<string, unknown> {
  const requireName = opts.requireName !== false;
  const body: Record<string, unknown> = {};
  if (requireName) {
    body.name = (input as CloverDiscountCreateInput).name;
  } else if (input.name != null) {
    body.name = input.name;
  }
  if (input.amount !== undefined) body.amount = input.amount;
  if (input.percentage !== undefined) body.percentage = input.percentage;
  return body;
}

function cloverEmployeeBody(
  input: CloverEmployeeCreateInput | CloverEmployeeUpdateInput,
  opts: { requireName?: boolean } = {},
): Record<string, unknown> {
  const requireName = opts.requireName !== false;
  const body: Record<string, unknown> = {};
  if (requireName) {
    body.name = (input as CloverEmployeeCreateInput).name;
  } else if (input.name != null) {
    body.name = input.name;
  }
  if (input.nickname !== undefined) body.nickname = input.nickname;
  if (input.customId !== undefined) body.customId = input.customId;
  if (input.email !== undefined) body.email = input.email;
  if (input.role != null) body.role = input.role;
  if (input.pin != null) body.pin = input.pin;
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
