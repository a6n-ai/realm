import { notificationOutbox } from "@/db/schema";

type Channel = (typeof notificationOutbox.channel.enumValues)[number];

export const MAX_ATTEMPTS = 6;
const BASE_BACKOFF_MS = 60_000;
const MAX_BACKOFF_MS = 3_600_000;

/** Exponential backoff: 1m, 2m, 4m … capped at 1h. */
export function nextBackoffMs(attempts: number): number {
  return Math.min(BASE_BACKOFF_MS * 2 ** attempts, MAX_BACKOFF_MS);
}

export interface PrefRow {
  channel: Channel;
  enabled: boolean;
  suppressed: boolean;
}

/**
 * Resolve which channels actually get an outbox row.
 * - explicit pref row: enabled AND not suppressed
 * - no pref row: default-on, EXCEPT email defers to the legacy
 *   `users.notifyEmail` opt-in so opted-out users are never mailed.
 */
export function resolveChannels(
  wanted: Channel[],
  prefs: PrefRow[],
  opts: { notifyEmail: boolean },
): Channel[] {
  const byChannel = new Map(prefs.map((p) => [p.channel, p]));
  return wanted.filter((c) => {
    const p = byChannel.get(c);
    if (p) return p.enabled && !p.suppressed;
    if (c === "email") return opts.notifyEmail;
    return true;
  });
}
