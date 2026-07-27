import type { CloverAppCredentials, CloverConnection, CloverTokenPair } from "./config";
import {
  isCloverAccessTokenExpired,
  refreshCloverTokens,
} from "./oauth";
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
 * Thin authenticated Platform API client.
 * Phase 1: auth + generic GET/POST. Payments / inventory land in later phases.
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

  platformOrigin(): string {
    const hosts = resolveCloverHosts(
      this.connection.environment ?? this.credentials.environment,
      this.connection.region ?? this.credentials.region,
    );
    return httpsOrigin(hosts.apiHost);
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

  /** Merchant display fields for Settings cards — never returns tokens. */
  async getMerchant(): Promise<CloverMerchantSummary> {
    const data = await this.get<{ id?: string; name?: string }>(
      `/v3/merchants/${encodeURIComponent(this.merchantId)}`,
    );
    return {
      id: typeof data.id === "string" && data.id ? data.id : this.merchantId,
      name: typeof data.name === "string" && data.name.trim() ? data.name.trim() : this.merchantId,
    };
  }
}

export type CloverMerchantSummary = {
  id: string;
  name: string;
};

/**
 * Webhook notes (later phases — not implemented here):
 * - Configure notification URLs in the Clover Developer Dashboard per app.
 * - Verify authenticity with the app's signing secret / verification headers.
 * - Typical events: payments, orders, inventory, app install/uninstall.
 * - Prefer idempotent handlers; Clover may retry deliveries.
 */
export const CLOVER_WEBHOOK_NOTES = {
  configureIn: "Clover Developer Dashboard → app → Webhooks / Notifications",
  verify: "Validate payload signature / app secret before mutating state",
  idempotency: "Dedupe by event id; retries are expected",
} as const;
