import { createLogger } from "@foundry/commons/logger";
import { getMetaPixelConfig, openAccessToken } from "@/lib/services/meta-pixel/config";
import { buildMetaUserData } from "./user-data";
import type { MetaCustomData, SendMetaEventArgs } from "./types";
import { runInBackground } from "@/lib/runtime/background";

const log = createLogger("meta-capi");

/** Confirmed current stable from https://developers.facebook.com/docs/graph-api/changelog/versions/ */
export const META_GRAPH_API_VERSION = "v26.0";

const TIMEOUT_MS = 5_000;

function customPayload(data: MetaCustomData | undefined): Record<string, unknown> | undefined {
  if (!data) return undefined;
  const out: Record<string, unknown> = {};
  if (data.value != null && Number.isFinite(data.value)) out.value = data.value;
  if (data.currency) out.currency = data.currency;
  if (data.content_ids?.length) out.content_ids = data.content_ids;
  if (data.content_type) out.content_type = data.content_type;
  if (data.content_name) out.content_name = data.content_name;
  if (data.num_items != null && Number.isFinite(data.num_items)) out.num_items = data.num_items;
  return Object.keys(out).length ? out : undefined;
}

/**
 * Pixel id, Conversions API token, and test event code come from Settings → Meta Pixel.
 * No-ops until that page has a saved pixel and a readable token.
 */
async function connection(): Promise<{ pixelId: string; token: string; testEventCode: string | null } | null> {
  try {
    const cfg = await getMetaPixelConfig();
    if (!cfg.installed || !cfg.pixelId) return null;
    const token = openAccessToken(cfg);
    if (!token) return null;
    return { pixelId: cfg.pixelId, token, testEventCode: cfg.testEventCode };
  } catch (err) {
    log.warn({ err }, "meta pixel config unreadable");
    return null;
  }
}

/**
 * Fire-and-forget Conversions API send. Never throws to the caller; logs Meta errors.
 * No-ops when the Settings connection is missing (pixel not saved, or token unreadable).
 */
export function sendMetaEvent(args: SendMetaEventArgs): void {
  const eventId = args.eventId?.trim();
  if (!eventId) {
    log.warn({ eventName: args.eventName }, "meta capi skipped: missing event_id");
    return;
  }

  // Workers cancel an un-awaited promise when the response ends; runInBackground hands it to waitUntil.
  runInBackground(async () => {
    const conn = await connection();
    if (!conn) return;
    const built = buildMetaCapiBody(args, conn.testEventCode);
    if (!built) return;

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`https://graph.facebook.com/${META_GRAPH_API_VERSION}/${conn.pixelId}/events`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...built, access_token: conn.token }),
        signal: ac.signal,
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        log.error({ status: res.status, body: text.slice(0, 500), eventName: args.eventName, eventId }, "meta capi HTTP error");
      }
    } catch (err) {
      log.error({ err, eventName: args.eventName, eventId }, "meta capi request failed");
    } finally {
      clearTimeout(timer);
    }
  }, "meta capi");
}

/** Exported for unit tests — builds the JSON body without sending. `testEventCode` is the value saved in Settings. */
export function buildMetaCapiBody(args: SendMetaEventArgs, testEventCode?: string | null): Record<string, unknown> | null {
  const eventId = args.eventId?.trim();
  if (!eventId) return null;

  const event: Record<string, unknown> = {
    event_name: args.eventName,
    event_time: args.eventTime ?? Math.floor(Date.now() / 1000),
    event_id: eventId,
    // Meta requires client_user_agent on website events. A settle with no stored browser
    // (staff verify, missing attribution) goes out as system_generated and matches on em/ph.
    action_source: args.userData.clientUserAgent?.trim() ? "website" : "system_generated",
    user_data: buildMetaUserData(args.userData),
  };
  const url = args.eventSourceUrl?.trim();
  if (url) event.event_source_url = url;
  const custom_data = customPayload(args.customData);
  if (custom_data) event.custom_data = custom_data;

  const body: Record<string, unknown> = { data: [event] };
  if (testEventCode) body.test_event_code = testEventCode;
  return body;
}
