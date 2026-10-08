import { ValidationError } from "@foundry/commons";
import { createLogger } from "@foundry/commons/logger";
import { optimoRouteApiKey } from "./config";
import { withConcurrency as runLimited } from "@/lib/concurrency";

const log = createLogger("optimoroute.client");

// Every HTTP call to OptimoRoute goes through this module. One place to inject the key,
// bound concurrency, and map status codes — so no caller can accidentally hammer the API
// or leak the key into a log line.
const BASE = "https://api.optimoroute.com/v1";

/**
 * "The maximum number of concurrent web service API requests for one account or for one
 * IP address is limited to 5." Server-side code will happily fire fifty at once, so the
 * cap is enforced here rather than left to callers. Kept at 4 to leave headroom for
 * anything else on this IP — including the Apps Script, while both run.
 */
export const MAX_CONCURRENCY = 4;

const TIMEOUT_MS = 20_000;

export type OptimoStop = {
  stopNumber?: number;
  orderNo?: string;
  id?: string;
  locationName?: string;
  address?: string;
  scheduledAtDt?: string;
  duration?: number;
  type?: string;
};

export type OptimoRoute = {
  driverSerial?: string;
  driverName?: string;
  driverExternalId?: string;
  stops?: OptimoStop[];
};

export type OptimoOrderPayload = {
  operation: "CREATE" | "UPDATE" | "SYNC" | "MERGE";
  orderNo: string;
  date: string;
  /** Required by the API — D delivery, P pickup, T task. Omitting it 400s. */
  type: "D" | "P" | "T";
  duration?: number;
  notes?: string;
  phone?: string;
  email?: string;
  location?: { address: string; locationName?: string; acceptPartialMatch?: boolean };
  customField1?: string;
  customField2?: string;
  customField3?: string;
  customField4?: string;
  customField5?: string;
  /** Tiffin count. Only sent when integrations_config.optimoroute.sendLoad is true. */
  load1?: number;
  load2?: number;
  load3?: number;
  load4?: number;
  /**
   * Forces this order onto a specific driver's route. Omitted, OptimoRoute's own
   * optimizer chooses — set only when a dispatcher has explicitly overridden it.

   */
  selectedDriver?: { driverSerial?: string; driverExternalId?: string };
};

export type OptimoOrderDetail = {
  orderNo?: string;
  customField1?: string; // phone, per buildPlannedOrders' push convention
  customField2?: string;
};

export type OptimoCompletionStatus = "success" | "failed" | "scheduled" | "rejected";

export type OptimoCompletionDetail = {
  status?: OptimoCompletionStatus;
  endTime?: { unixTimestamp?: number };
  /** Present on a failed stop — the driver's reason. */
  form?: { note?: string; images?: { type: string; url: string }[] };
};

export class OptimoRouteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "OptimoRouteError";
  }
}

function requireKey(): string {
  const key = optimoRouteApiKey();
  if (!key) {
    throw new ValidationError(
      "OPTIMOROUTE_API_KEY is not set — add it to the server environment before syncing routes",
    );
  }
  return key;
}

// The key travels in the query string (the API offers no header auth), so it must never
// reach a log or an error message handed back to the UI.
function redact(url: string): string {
  return url.replace(/key=[^&]*/, "key=***");
}

async function request<T>(path: string, init: RequestInit & { retries?: number } = {}): Promise<T> {
  const { retries = 2, ...rest } = init;
  const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}key=${encodeURIComponent(requireKey())}`;

  let lastError: OptimoRouteError | null = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let response: Response;
    try {
      response = await fetch(url, { ...rest, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      // Network failure or timeout: retryable, and carries no response to inspect.
      lastError = new OptimoRouteError(
        e instanceof Error ? e.message : "Network error", 0, true,
      );
      if (attempt < retries) continue;
      throw lastError;
    }

    const text = await response.text();
    if (response.ok) {
      try {
        return JSON.parse(text) as T;
      } catch {
        throw new OptimoRouteError("OptimoRoute returned a non-JSON body", response.status, false);
      }
    }

    // 4xx is our fault and will fail identically on retry; only 429/5xx are worth repeating.
    const retryable = response.status === 429 || response.status >= 500;
    const detail = (() => {
      try {
        const parsed = JSON.parse(text) as { message?: string };
        return parsed.message ?? text.slice(0, 200);
      } catch {
        return text.slice(0, 200);
      }
    })();

    lastError = new OptimoRouteError(
      response.status === 401 || response.status === 403
        ? "OptimoRoute rejected the API key"
        : detail || `HTTP ${response.status}`,
      response.status,
      retryable,
    );
    log.warn({ url: redact(url), status: response.status, attempt }, "optimoroute request failed");
    if (!retryable || attempt === retries) throw lastError;
    await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
  }

  throw lastError ?? new OptimoRouteError("Unreachable", 0, false);
}

/** Planned routes for a date. Empty array when the date has no plan yet. */
export async function getRoutes(date: string): Promise<OptimoRoute[]> {
  const data = await request<{ success?: boolean; routes?: OptimoRoute[] }>(
    `/get_routes?date=${encodeURIComponent(date)}`,
    { method: "GET" },
  );
  return data.success && data.routes ? data.routes : [];
}

export async function createOrder(payload: OptimoOrderPayload): Promise<void> {
  const data = await request<{ success?: boolean; message?: string }>("/create_order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (data.success !== true) {
    throw new OptimoRouteError(data.message || "OptimoRoute returned success=false", 200, false);
  }
}

/** OptimoRoute docs don't publish a hard cap for get_orders/get_completion_details batch
 *  size; chunking defensively keeps one oversized day from failing as a single request. */
const BULK_CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Shared by getOrderDetails/getCompletionDetails — both endpoints share this envelope:
 *  `{success, orders: [{success, id, data}]}`, looked up by OptimoRoute stop id. */
async function bulkLookup<T>(path: string, ids: string[]): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (ids.length === 0) return out;

  const batches = chunk(ids, BULK_CHUNK_SIZE);
  const results = await withConcurrency(batches, (batch) =>
    request<{ success?: boolean; orders?: { success?: boolean; id?: string; data?: T }[] }>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orders: batch.map((id) => ({ id })) }),
    }),
  );

  for (const data of results) {
    for (const entry of data.orders ?? []) {
      if (entry.success && entry.id && entry.data) out.set(entry.id, entry.data);
    }
  }
  return out;
}

/** Order detail (incl. customField1-5) per OptimoRoute stop id — used to recover the phone
 *  number on stops this app didn't push itself (see completions.ts). */
export async function getOrderDetails(ids: string[]): Promise<Map<string, OptimoOrderDetail>> {
  return bulkLookup<OptimoOrderDetail>("/get_orders", ids);
}

/** Proof-of-delivery / completion status per OptimoRoute stop id. */
export async function getCompletionDetails(ids: string[]): Promise<Map<string, OptimoCompletionDetail>> {
  return bulkLookup<OptimoCompletionDetail>("/get_completion_details", ids);
}

export async function deleteOrder(orderNo: string): Promise<void> {
  const data = await request<{ success?: boolean; message?: string }>("/delete_order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ orderNo }),
  });
  if (data.success !== true) {
    throw new OptimoRouteError(data.message || "OptimoRoute returned success=false", 200, false);
  }
}

export type OptimoScheduleInfo = {
  driverSerial?: string;
  driverName?: string;
  stopNumber?: number;
  scheduledAtDt?: string;
};

export type OptimoSearchOrder = {
  id: string;
  data?: { orderNo?: string; phone?: string; customField1?: string; customField2?: string };
  /** null when the order exists but OptimoRoute has not put it on a route ("unscheduled"). */
  scheduleInformation?: OptimoScheduleInfo | null;
};

/** Every order on the (shared) account for one date, planned or not. get_routes only sees planned stops. */
export async function searchOrdersForDate(date: string): Promise<OptimoSearchOrder[]> {
  const out: OptimoSearchOrder[] = [];
  let afterTag: string | undefined;
  // ponytail: 20 pages × 500 = 10k orders/day ceiling; raise if the shared account ever gets there.
  for (let page = 0; page < 20; page++) {
    const data = await request<{ success?: boolean; message?: string; orders?: OptimoSearchOrder[]; after_tag?: string }>(
      "/search_orders",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          dateRange: { from: date, to: date },
          includeOrderData: true,
          includeScheduleInformation: true,
          ...(afterTag ? { after_tag: afterTag } : {}),
        }),
      },
    );
    if (data.success !== true) {
      throw new OptimoRouteError(data.message || "search_orders returned success=false", 200, false);
    }
    out.push(...(data.orders ?? []));
    if (!data.after_tag) break;
    afterTag = data.after_tag;
  }
  return out;
}

export type OptimoEvent = {
  event: string;
  unixTimestamp: number;
  orderNo?: string;
  orderId?: string;
  driverName?: string;
  driverSerial?: string;
};

/** Driver-app events for live routes since `afterTag` ("" = from the start). OptimoRoute's stand-in for webhooks. */
export async function getEvents(afterTag: string): Promise<{ events: OptimoEvent[]; tag: string; remaining: number }> {
  const data = await request<{ success?: boolean; message?: string; code?: string; events?: OptimoEvent[]; tag?: string; remainingEvents?: number }>(
    `/get_events?after_tag=${encodeURIComponent(afterTag)}`,
    { method: "GET" },
  );
  if (data.success !== true) {
    throw new OptimoRouteError(data.message || data.code || "get_events returned success=false", 200, false);
  }
  return { events: data.events ?? [], tag: data.tag ?? afterTag, remaining: data.remainingEvents ?? 0 };
}

/** OptimoRoute calls default to MAX_CONCURRENCY — its rate limit, not ours. */
export function withConcurrency<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  limit = MAX_CONCURRENCY,
): Promise<R[]> {
  return runLimited(items, worker, limit);
}

/** Connectivity + auth check for the settings screen. Never throws on a bad key. */
export async function checkConnection(date: string): Promise<{ ok: boolean; message: string }> {
  try {
    const routes = await getRoutes(date);
    return { ok: true, message: `Connected — ${routes.length} route(s) planned for ${date}` };
  } catch (e) {
    if (e instanceof OptimoRouteError || e instanceof ValidationError) {
      return { ok: false, message: e.message };
    }
    throw e;
  }
}
