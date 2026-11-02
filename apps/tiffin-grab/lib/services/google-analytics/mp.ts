import { createLogger } from "@foundry/commons/logger";
import { getGaConfig, openApiSecret } from "./config";

const log = createLogger("google-analytics");

export type GaEvent = { name: string; params?: Record<string, string | number | undefined> };

/** `_ga` = "GA1.1.<random>.<timestamp>"; the client_id is the last two parts. */
export function clientIdFromGaCookie(cookie: string | null | undefined): string | null {
  const parts = cookie?.split(".") ?? [];
  return parts.length >= 4 ? parts.slice(-2).join(".") : null;
}

/**
 * GA4 requires a client_id. Without the customer's browser (Stripe webhook, staff verify) a
 * stable per-user one keeps their server events together; user_id joins it to web sessions.
 */
export function buildMpBody(input: { clientId: string | null; userId?: string | null; event: GaEvent; debug?: boolean }) {
  return {
    client_id: input.clientId ?? (input.userId ? `${input.userId}.0` : `${crypto.randomUUID()}.${Math.floor(Date.now() / 1000)}`),
    user_id: input.userId || undefined,
    events: [{ name: input.event.name, params: { ...input.event.params, ...(input.debug ? { debug_mode: 1 } : {}) } }],
  };
}

export type GaSendResult = { ok: true; validationMessages?: { description: string }[] } | { ok: false; error: string };

/** Never throws. `validate` posts to /debug/mp/collect, which checks the payload but records nothing. */
export async function sendGaEvent(
  input: { clientId: string | null; userId?: string | null; event: GaEvent },
  opts: { validate?: boolean; debug?: boolean } = {},
): Promise<GaSendResult> {
  try {
    const cfg = await getGaConfig();
    if (!cfg.installed || !cfg.measurementId) return { ok: false, error: "Google Analytics is not set up" };
    const secret = openApiSecret(cfg);
    if (!secret) return { ok: false, error: "Measurement Protocol API secret is missing or unreadable" };

    const path = opts.validate ? "debug/mp/collect" : "mp/collect";
    const url = `https://www.google-analytics.com/${path}?measurement_id=${cfg.measurementId}&api_secret=${encodeURIComponent(secret)}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(buildMpBody({ ...input, debug: opts.debug })),
      signal: AbortSignal.timeout(8000),
    });
    // mp/collect answers 2xx with no body even for a bad payload; only the debug endpoint explains.
    if (!res.ok) {
      log.warn({ status: res.status, event: input.event.name }, "ga mp send failed");
      return { ok: false, error: `Google returned ${res.status}` };
    }
    if (!opts.validate) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as { validationMessages?: { description: string }[] };
    return { ok: true, validationMessages: body.validationMessages ?? [] };
  } catch (err) {
    log.warn({ err, event: input.event.name }, "ga mp send threw");
    return { ok: false, error: err instanceof Error ? err.message : "Could not reach Google" };
  }
}
