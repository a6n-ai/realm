import { createLogger } from "@foundry/commons/logger";
import { relayRpc, type RelayTemplateOverride } from "./client";

const log = createLogger("relay-overrides");
const TTL_MS = 60_000;

let cached: { at: number; map: Map<string, RelayTemplateOverride> } | null = null;

export const overrideKey = (event: string, locale: string) => `${event}:${locale}`;

/** Relay's template overrides keyed `event:locale`, cached per isolate. Relay down: the last map, or null when none was ever read. */
export async function getTemplateOverrides(): Promise<Map<string, RelayTemplateOverride> | null> {
  if (cached && Date.now() - cached.at < TTL_MS) return cached.map;
  try {
    const rows = await relayRpc().templateOverrides();
    const map = new Map(rows.flatMap((r) => (r.event ? [[overrideKey(r.event, r.locale), r] as const] : [])));
    cached = { at: Date.now(), map };
    return map;
  } catch (err) {
    log.warn({ err: err instanceof Error ? err.message : "unknown" }, "template overrides unavailable");
    return cached?.map ?? null;
  }
}

/** Tests only: a cache from one test must not answer the next. */
export function clearTemplateOverrideCache(): void {
  cached = null;
}
