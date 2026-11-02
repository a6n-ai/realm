import { createHash } from "node:crypto";
import { cookies, headers } from "next/headers";
import { after } from "next/server";
import { createLogger } from "@foundry/commons/logger";
import { trustedIpHeaders } from "@/lib/runtime/platform";
import { getMetaPixelConfig, openAccessToken } from "./config";

const log = createLogger("meta-pixel");
const GRAPH_VERSION = "v26.0";

export type MetaEventName = "PageView" | "Lead" | "CompleteRegistration" | "Purchase";

export type MetaUser = {
  email?: string | null;
  phone?: string | null;
  fullName?: string | null;
  externalId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
};

export type MetaEventInput = {
  eventName: MetaEventName;
  /** Stable per real-world event: Meta drops repeats of the same event_name + event_id within 48h. */
  eventId: string;
  eventTimeMs?: number;
  sourceUrl?: string | null;
  user: MetaUser;
  customData?: { value?: number; currency?: string; order_id?: string; content_name?: string };
};

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");
const hashed = (v: string | null | undefined) => (v ? [sha256(v)] : undefined);

/**
 * Meta's normalization before hashing: email trimmed + lowercased; phone digits only with
 * country code; names lowercased. IP, user agent, fbp and fbc must NOT be hashed.
 */
export function buildServerEvent(input: MetaEventInput) {
  const u = input.user;
  const email = u.email?.trim().toLowerCase() || null;
  const phone = u.phone?.replace(/\D/g, "") || null;
  const parts = (u.fullName ?? "").trim().toLowerCase().split(/\s+/).filter(Boolean);
  const user_data = {
    em: hashed(email),
    ph: hashed(phone),
    fn: hashed(parts[0]),
    ln: hashed(parts.length > 1 ? parts[parts.length - 1] : null),
    external_id: hashed(u.externalId),
    client_ip_address: u.ip || undefined,
    client_user_agent: u.userAgent || undefined,
    fbp: u.fbp || undefined,
    fbc: u.fbc || undefined,
  };
  return {
    event_name: input.eventName,
    event_time: Math.floor((input.eventTimeMs ?? Date.now()) / 1000),
    event_id: input.eventId,
    // Meta requires client_user_agent on "website" events; a settle from a Stripe webhook or a
    // staff verify has no customer browser, so it goes as system_generated and matches on em/ph.
    action_source: u.userAgent ? ("website" as const) : ("system_generated" as const),
    event_source_url: input.sourceUrl || undefined,
    user_data,
    custom_data: input.customData,
  };
}

export type SendResult = { ok: true; eventsReceived: number } | { ok: false; error: string };

/** Never throws: tracking must not break checkout, signup or a payment verify. */
export async function sendMetaEvent(input: MetaEventInput): Promise<SendResult> {
  try {
    const cfg = await getMetaPixelConfig();
    if (!cfg.installed || !cfg.pixelId) return { ok: false, error: "Meta Pixel is not set up" };
    const token = openAccessToken(cfg);
    if (!token) return { ok: false, error: "Conversions API token is missing or unreadable" };

    const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${cfg.pixelId}/events`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: [buildServerEvent({ ...input, sourceUrl: input.sourceUrl || process.env.BETTER_AUTH_URL || null })],
        access_token: token,
        ...(cfg.testEventCode ? { test_event_code: cfg.testEventCode } : {}),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const body = (await res.json().catch(() => ({}))) as { events_received?: number; error?: { message?: string } };
    if (!res.ok) {
      const error = body.error?.message ?? `Meta returned ${res.status}`;
      log.warn({ status: res.status, error, eventName: input.eventName }, "meta capi send failed");
      return { ok: false, error };
    }
    return { ok: true, eventsReceived: body.events_received ?? 0 };
  } catch (err) {
    log.warn({ err, eventName: input.eventName }, "meta capi send threw");
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Meta" };
  }
}

/** Browser signals for the current request. Empty outside a request (cron, scripts). */
export async function requestMetaUser(): Promise<Pick<MetaUser, "ip" | "userAgent" | "fbp" | "fbc"> & { sourceUrl: string | null }> {
  try {
    const [h, c] = await Promise.all([headers(), cookies()]);
    const ip = trustedIpHeaders().map((k) => h.get(k)).find(Boolean) ?? null;
    return {
      ip,
      userAgent: h.get("user-agent"),
      fbp: c.get("_fbp")?.value ?? null,
      fbc: c.get("_fbc")?.value ?? null,
      sourceUrl: h.get("referer"),
    };
  } catch {
    return { ip: null, userAgent: null, fbp: null, fbc: null, sourceUrl: null };
  }
}

/**
 * Fire-and-forget after the response. Pass `withRequest` only when the current request is the
 * customer's own browser — a Stripe webhook or a staff verify would attach the wrong IP.
 */
export function trackMetaEvent(input: MetaEventInput, opts: { withRequest?: boolean } = {}): void {
  const run = async () => {
    if (opts.withRequest) {
      const { sourceUrl, ...browser } = await requestMetaUser();
      input = { ...input, sourceUrl: input.sourceUrl ?? sourceUrl, user: { ...browser, ...input.user } };
    }
    await sendMetaEvent(input);
  };
  try {
    after(run);
  } catch {
    // Outside a request scope (cron, scripts): nothing to wait for, send now.
    void run();
  }
}
