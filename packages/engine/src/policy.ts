import type { Channel, Kind } from "./types";

export const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 3_600_000;

/** Exponential backoff: 1m, 2m, 4m … capped at 1h. */
export function nextBackoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

export interface PrefRow {
  channel: Channel;
  kind: Kind;
  enabled: boolean;
}

export interface ResolveOpts {
  /** Defaults to "transactional" so a caller that forgets cannot silently mail marketing. */
  kind?: Kind;
  /** Addresses' suppressed channels, resolved from message_suppression by the caller. */
  suppressed?: Channel[];
  /** tiffin-grab's legacy users.notifyEmail opt-in. Absent = allowed. */
  notifyEmail?: boolean;
}

/**
 * Resolve which channels actually get an outbox row.
 * - suppressed channel: never, whatever the prefs say (bounce/complaint/STOP is a fact)
 * - explicit pref row for this (channel, kind): honour `enabled`
 * - no pref row: default-on, EXCEPT email defers to the legacy notifyEmail opt-in
 */
export function resolveChannels(
  wanted: Channel[],
  prefs: PrefRow[],
  opts: ResolveOpts,
): Channel[] {
  const kind = opts.kind ?? "transactional";
  const suppressed = new Set(opts.suppressed ?? []);
  const byKey = new Map(prefs.map((p) => [`${p.channel}:${p.kind}`, p]));

  return wanted.filter((c) => {
    if (suppressed.has(c)) return false;
    const p = byKey.get(`${c}:${kind}`);
    if (p) return p.enabled;
    if (c === "email" && opts.notifyEmail === false) return false;
    return true;
  });
}
